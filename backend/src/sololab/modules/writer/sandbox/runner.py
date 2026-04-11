#!/usr/bin/env python3
"""WriterAI sandbox code execution runner.

This script runs inside the isolated Docker container.
It executes user-provided Python code and collects generated figure outputs.
"""
import json
import os
import sys
import traceback

OUTPUT_DIR = "/output"


def main() -> None:
    code_path = sys.argv[1] if len(sys.argv) > 1 else "/sandbox/code.py"

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    import matplotlib
    matplotlib.use("Agg")
    # Configure Chinese font support (Noto Sans CJK installed in Docker image)
    matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'Noto Sans CJK', 'DejaVu Sans']
    matplotlib.rcParams['axes.unicode_minus'] = False
    import matplotlib.pyplot as plt

    namespace = {
        "__name__": "__main__",
        "OUTPUT_DIR": OUTPUT_DIR,
    }

    try:
        with open(code_path) as f:
            code = f.read()

        exec(code, namespace)  # noqa: S102

        # Auto-save any open matplotlib figures if user didn't save explicitly
        fig_nums = plt.get_fignums()
        for i, num in enumerate(fig_nums):
            fig = plt.figure(num)
            fig_path = os.path.join(OUTPUT_DIR, f"figure_{i + 1}.png")
            if not os.path.exists(fig_path):
                fig.savefig(fig_path, dpi=150, bbox_inches="tight")
        plt.close("all")

        # Collect generated figure files
        figures = sorted(
            f
            for f in os.listdir(OUTPUT_DIR)
            if f.endswith((".png", ".jpg", ".jpeg", ".svg", ".pdf"))
        )

        result = {"success": True, "figures": figures}
    except Exception as e:
        result = {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }

    with open(os.path.join(OUTPUT_DIR, "result.json"), "w") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
