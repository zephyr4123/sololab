"""SandboxExecutor — Docker-based isolated code execution for WriterAI.

Runs user-generated Python code (typically matplotlib/plotly plots)
in a restricted Docker container with no network access, limited
memory, and no API keys.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

SANDBOX_IMAGE = "sololab-writer-sandbox"
# Shared temp dir mounted at same path on host and container (DooD volume alignment)
SANDBOX_SHARED_DIR = "/tmp/sololab-sandbox"


@dataclass
class SandboxResult:
    """Result of a sandbox code execution."""

    success: bool
    figures: list[str]  # List of figure file paths (absolute, in storage)
    figure_urls: list[str]  # Relative URLs for API access
    error: str | None = None
    traceback: str | None = None


class SandboxExecutor:
    """Execute Python code in an isolated Docker container."""

    def __init__(
        self,
        storage_path: str = "./storage",
        timeout: int = 30,
        memory: str = "512m",
    ) -> None:
        self.storage_path = Path(storage_path)
        self.timeout = timeout
        self.memory = memory

    async def execute(self, code: str, doc_id: str) -> SandboxResult:
        """Run Python code in sandbox and collect figure outputs.

        Args:
            code: Python source code to execute.
            doc_id: Document ID for organizing output files.

        Returns:
            SandboxResult with figure paths and any errors.
        """
        # Prepare directories
        figures_dir = self.storage_path / "writer" / doc_id / "figures"
        figures_dir.mkdir(parents=True, exist_ok=True)

        os.makedirs(SANDBOX_SHARED_DIR, exist_ok=True)
        tmp_dir = tempfile.mkdtemp(prefix="writer_sandbox_", dir=SANDBOX_SHARED_DIR)
        code_path = os.path.join(tmp_dir, "code.py")
        output_dir = os.path.join(tmp_dir, "output")
        os.makedirs(output_dir, exist_ok=True)

        try:
            # Write code to temp file
            with open(code_path, "w", encoding="utf-8") as f:
                f.write(code)

            # Run Docker container
            cmd = [
                "docker", "run",
                "--rm",
                "--network", "none",
                "--memory", self.memory,
                "--cpus", "1",
                "--read-only",
                "--tmpfs", "/tmp:size=100m",
                "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges:true",
                "-v", f"{code_path}:/sandbox/code.py:ro",
                "-v", f"{output_dir}:/output",
                SANDBOX_IMAGE,
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=self.timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.communicate()
                return SandboxResult(
                    success=False,
                    figures=[],
                    figure_urls=[],
                    error=f"Code execution timed out after {self.timeout}s",
                )

            # Read result
            result_path = os.path.join(output_dir, "result.json")
            if not os.path.exists(result_path):
                stderr_text = stderr.decode("utf-8", errors="replace") if stderr else ""
                return SandboxResult(
                    success=False,
                    figures=[],
                    figure_urls=[],
                    error=f"Sandbox execution failed (exit code {process.returncode})",
                    traceback=stderr_text or None,
                )

            with open(result_path) as f:
                result_data = json.load(f)

            if not result_data.get("success"):
                return SandboxResult(
                    success=False,
                    figures=[],
                    figure_urls=[],
                    error=result_data.get("error", "Unknown error"),
                    traceback=result_data.get("traceback"),
                )

            # Move figures to persistent storage
            figure_files = result_data.get("figures", [])
            stored_paths: list[str] = []
            figure_urls: list[str] = []

            for fig_name in figure_files:
                src = os.path.join(output_dir, fig_name)
                if not os.path.exists(src):
                    continue

                # Generate unique filename to avoid collisions
                ext = os.path.splitext(fig_name)[1]
                unique_name = f"{uuid.uuid4().hex[:8]}_{fig_name}"
                dest = figures_dir / unique_name
                shutil.copy2(src, dest)

                stored_paths.append(str(dest))
                figure_urls.append(f"/storage/writer/{doc_id}/figures/{unique_name}")

            logger.info(
                "Sandbox execution successful: %d figures generated for doc %s",
                len(stored_paths),
                doc_id,
            )

            return SandboxResult(
                success=True,
                figures=stored_paths,
                figure_urls=figure_urls,
            )

        except FileNotFoundError:
            return SandboxResult(
                success=False,
                figures=[],
                figure_urls=[],
                error="Docker not available. Ensure Docker is installed and running.",
            )
        except Exception as e:
            logger.exception("Sandbox execution error for doc %s", doc_id)
            return SandboxResult(
                success=False,
                figures=[],
                figure_urls=[],
                error=str(e),
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    async def ensure_image(self) -> bool:
        """Check if the sandbox Docker image exists."""
        process = await asyncio.create_subprocess_exec(
            "docker", "image", "inspect", SANDBOX_IMAGE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.communicate()
        return process.returncode == 0

    async def build_image(self, project_root: str | Path) -> bool:
        """Build the sandbox Docker image from the project Dockerfile."""
        dockerfile = Path(project_root) / "infra" / "docker" / "writer-sandbox.Dockerfile"
        if not dockerfile.exists():
            logger.error("Sandbox Dockerfile not found: %s", dockerfile)
            return False

        process = await asyncio.create_subprocess_exec(
            "docker", "build",
            "-t", SANDBOX_IMAGE,
            "-f", str(dockerfile),
            str(project_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.error("Failed to build sandbox image: %s", stderr.decode())
            return False

        logger.info("Sandbox image built successfully: %s", SANDBOX_IMAGE)
        return True
