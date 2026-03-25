"""Benchmark CLI 入口 - 支持命令行运行评测。"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="IdeaSpark Benchmark - 多智能体创意生成评测框架",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  # 快速验证（3 个主题 × 1 次）
  python -m sololab.benchmark.cli quick

  # 完整 benchmark（15 主题 × 3 次 × 7 条件）
  python -m sololab.benchmark.cli full

  # 只跑消融实验（5 主题 × 2 次 × 7 条件）
  python -m sololab.benchmark.cli ablation --topics cs-01 bio-01 mat-01 soc-01 cross-01

  # 只跑指定条件
  python -m sololab.benchmark.cli ablation --conditions full baseline_single no_tools

  # 从历史结果生成报告
  python -m sololab.benchmark.cli report --input benchmark_results/
""",
    )

    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # --- quick ---
    p_quick = subparsers.add_parser("quick", help="快速验证（3 主题 × 1 次）")
    p_quick.add_argument("--topics", nargs="*", help="指定主题 ID")
    p_quick.add_argument("--n", type=int, default=3, help="主题数量")
    p_quick.add_argument("--output", default="benchmark_results", help="输出目录")

    # --- full ---
    p_full = subparsers.add_parser("full", help="完整 benchmark")
    p_full.add_argument("--topics", nargs="*", help="指定主题 ID")
    p_full.add_argument("--runs", type=int, default=3, help="每主题重复次数")
    p_full.add_argument("--output", default="benchmark_results", help="输出目录")

    # --- ablation ---
    p_ablation = subparsers.add_parser("ablation", help="消融实验")
    p_ablation.add_argument("--topics", nargs="*", help="指定主题 ID")
    p_ablation.add_argument("--conditions", nargs="*", help="消融条件")
    p_ablation.add_argument("--runs", type=int, default=2, help="每条件重复次数")
    p_ablation.add_argument("--output", default="benchmark_results", help="输出目录")

    # --- report ---
    p_report = subparsers.add_parser("report", help="从历史结果生成报告")
    p_report.add_argument("--input", default="benchmark_results", help="结果目录")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    if args.command == "report":
        _generate_report(args)
    else:
        asyncio.run(_run_benchmark(args))


async def _run_benchmark(args):
    from sololab.benchmark.ablation import AblationCondition
    from sololab.benchmark.config import BenchmarkParams
    from sololab.benchmark.report import save_report
    from sololab.benchmark.runner import BenchmarkRunner

    runner = BenchmarkRunner.from_settings()
    runner.params.output_dir = getattr(args, "output", "benchmark_results")

    if args.command == "quick":
        results = await runner.run_quick_benchmark(
            topic_ids=args.topics,
            n_topics=args.n,
        )
    elif args.command == "full":
        runner.params.runs_per_topic = args.runs
        results = await runner.run_full_benchmark(
            conditions=[AblationCondition.FULL],
            topic_ids=args.topics,
        )
    elif args.command == "ablation":
        runner.params.runs_per_topic = args.runs
        conditions = None
        if args.conditions:
            conditions = [AblationCondition(c) for c in args.conditions]
        results = await runner.run_full_benchmark(
            conditions=conditions,
            topic_ids=args.topics,
        )

    # 生成报告
    result_dicts = [r.to_dict() for r in results]
    report_path = save_report(result_dicts, runner.params.output_dir)
    logger.info("Benchmark 完成！报告: %s", report_path)

    # 打印汇总
    total_cost = sum(r.cost_usd for r in results)
    avg_quality = 0.0
    quality_runs = [r for r in results if r.metrics.get("avg_quality", 0) > 0]
    if quality_runs:
        avg_quality = sum(r.metrics["avg_quality"] for r in quality_runs) / len(quality_runs)

    print(f"\n{'='*50}")
    print(f"  Benchmark 完成")
    print(f"  总运行次数: {len(results)}")
    print(f"  平均质量分: {avg_quality:.2f} / 10")
    print(f"  总费用: ${total_cost:.4f}")
    print(f"  报告: {report_path}")
    print(f"{'='*50}")


def _generate_report(args):
    from sololab.benchmark.report import save_report
    from sololab.benchmark.runner import BenchmarkRunner

    runner = BenchmarkRunner.from_settings()
    results = runner.load_results(args.input)
    if not results:
        logger.error("未找到结果文件: %s", args.input)
        sys.exit(1)

    report_path = save_report(results, args.input)
    logger.info("报告生成完成: %s", report_path)


if __name__ == "__main__":
    main()
