"""定价表与费用估算。

设计：
- 价格数据外置到 pricing.json（按 provider 分组）
- PricingTable 提供 (model, prompt_tok, completion_tok) → cost_usd 的纯计算
- 匹配策略：精确 → 前缀（兼容版本后缀）→ 0.0 with warning

使用：
    table = PricingTable.load_default()
    cost = table.estimate("deepseek-v4-flash", 100, 200)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

_DEFAULT_PRICING_PATH = Path(__file__).parent / "pricing.json"


class PricingTable:
    """模型定价表 —— 不可变，从 JSON 加载后只读。"""

    def __init__(self, prices: Dict[str, Tuple[float, float]]) -> None:
        # 扁平化：{model_name: (prompt_price, completion_price)}
        self._prices = dict(prices)

    @classmethod
    def load(cls, path: Path) -> "PricingTable":
        """从 JSON 文件加载。文件按 provider 分组，本类拍平为单一映射。"""
        data = json.loads(path.read_text(encoding="utf-8"))
        flat: Dict[str, Tuple[float, float]] = {}
        for provider, models in data.items():
            if provider.startswith("_"):
                continue
            if not isinstance(models, dict):
                continue
            for model, price in models.items():
                if isinstance(price, list) and len(price) == 2:
                    flat[model] = (float(price[0]), float(price[1]))
        return cls(flat)

    @classmethod
    def load_default(cls) -> "PricingTable":
        """加载内置默认定价表。"""
        return cls.load(_DEFAULT_PRICING_PATH)

    def estimate(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """估算费用 (USD)。

        匹配策略：
        1. 精确匹配模型名
        2. 前缀匹配（兼容版本后缀，如 "gpt-4o-2024-11-20" 命中 "gpt-4o"）
        3. 都没命中 → 0.0 + 一次性 warning
        """
        if model in self._prices:
            prompt_price, completion_price = self._prices[model]
        else:
            matched = None
            for key in self._prices:
                if model.startswith(key) or key.startswith(model):
                    matched = key
                    break
            if matched:
                prompt_price, completion_price = self._prices[matched]
            else:
                logger.warning("模型 %s 不在定价表中，费用按 0 计算", model)
                return 0.0
        return (prompt_tokens * prompt_price + completion_tokens * completion_price) / 1_000_000

    def known_models(self) -> list[str]:
        return sorted(self._prices.keys())
