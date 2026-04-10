"""SandboxExecutor 单元测试。

测试 Docker 沙箱代码执行。
需要 Docker 运行环境。
"""
import asyncio
import os
import tempfile

import pytest
import pytest_asyncio

from sololab.modules.writer.sandbox.executor import SandboxExecutor, SANDBOX_IMAGE


# ── Fixtures ────────────────────────────────────────────

@pytest_asyncio.fixture
async def executor():
    """创建 SandboxExecutor 实例，使用临时存储目录。"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield SandboxExecutor(
            storage_path=tmpdir,
            timeout=30,
            memory="256m",
        )


@pytest.fixture
def docker_available():
    """检查 Docker 是否可用。"""
    result = os.system("docker info > /dev/null 2>&1")  # noqa: S605
    if result != 0:
        pytest.skip("Docker not available")


@pytest_asyncio.fixture
async def sandbox_image_ready(docker_available):
    """确保沙箱镜像存在。"""
    process = await asyncio.create_subprocess_exec(
        "docker", "image", "inspect", SANDBOX_IMAGE,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await process.communicate()
    if process.returncode != 0:
        pytest.skip(f"Sandbox image '{SANDBOX_IMAGE}' not built. Run: docker build -t {SANDBOX_IMAGE} -f infra/docker/writer-sandbox.Dockerfile .")


# ── 镜像检测 ───────────────────────────────────────────

class TestImageManagement:
    """测试镜像检测功能。"""

    @pytest.mark.integration
    async def test_ensure_image(self, executor, docker_available):
        exists = await executor.ensure_image()
        # 可能存在也可能不存在，只要不抛异常就行
        assert isinstance(exists, bool)


# ── 代码执行 ───────────────────────────────────────────

@pytest.mark.integration
class TestCodeExecution:
    """测试沙箱代码执行。"""

    async def test_simple_plot(self, executor, sandbox_image_ready):
        code = """
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y = np.sin(x)
plt.figure(figsize=(8, 4))
plt.plot(x, y)
plt.title("Test Plot")
plt.savefig("/output/test_plot.png", dpi=72)
"""
        result = await executor.execute(code, doc_id="test-doc-1")
        assert result.success is True
        assert len(result.figures) >= 1
        assert len(result.figure_urls) >= 1
        assert all(url.startswith("/storage/") for url in result.figure_urls)
        # 验证文件确实存在
        assert all(os.path.exists(f) for f in result.figures)

    async def test_auto_save_matplotlib(self, executor, sandbox_image_ready):
        """测试自动保存未显式 savefig 的图表。"""
        code = """
import matplotlib.pyplot as plt
plt.figure()
plt.plot([1, 2, 3], [1, 4, 9])
plt.title("Auto Save Test")
# 没有显式调用 savefig，runner.py 应自动保存
"""
        result = await executor.execute(code, doc_id="test-doc-auto")
        assert result.success is True
        assert len(result.figures) >= 1

    async def test_plotly_chart(self, executor, sandbox_image_ready):
        code = """
import plotly.graph_objects as go
fig = go.Figure(data=go.Bar(x=['A', 'B', 'C'], y=[1, 3, 2]))
fig.write_image("/output/bar_chart.png")
"""
        result = await executor.execute(code, doc_id="test-doc-plotly")
        assert result.success is True
        assert len(result.figures) >= 1

    async def test_syntax_error(self, executor, sandbox_image_ready):
        code = "def broken(\n"
        result = await executor.execute(code, doc_id="test-doc-err")
        assert result.success is False
        assert result.error is not None

    async def test_runtime_error(self, executor, sandbox_image_ready):
        code = "x = 1 / 0"
        result = await executor.execute(code, doc_id="test-doc-runtime")
        assert result.success is False
        assert "ZeroDivisionError" in (result.error or "")

    async def test_timeout(self, executor, sandbox_image_ready):
        """测试超时。使用较短超时。"""
        executor.timeout = 3
        code = "import time; time.sleep(60)"
        result = await executor.execute(code, doc_id="test-doc-timeout")
        assert result.success is False
        assert "timed out" in (result.error or "").lower()

    async def test_no_network(self, executor, sandbox_image_ready):
        """测试网络隔离（沙箱无法访问外网）。"""
        code = """
import urllib.request
try:
    urllib.request.urlopen("https://httpbin.org/get", timeout=5)
    raise Exception("Network should be blocked!")
except Exception as e:
    if "Network should be blocked" in str(e):
        raise
    # 网络错误是预期的
    with open("/output/result_override.txt", "w") as f:
        f.write("network_blocked")
"""
        result = await executor.execute(code, doc_id="test-doc-network")
        # 代码本身不会产出图表，但不应该因为网络错误而失败
        assert result.success is True

    async def test_multiple_figures(self, executor, sandbox_image_ready):
        code = """
import matplotlib.pyplot as plt
for i in range(3):
    plt.figure()
    plt.plot([1, 2, 3], [i, i+1, i+2])
    plt.savefig(f"/output/fig_{i}.png")
"""
        result = await executor.execute(code, doc_id="test-doc-multi")
        assert result.success is True
        assert len(result.figures) == 3
