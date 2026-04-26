"""Persona 注册中心 —— YAML 自动发现 + 热插。

仿 WriterAI TemplateRegistry 模式：把 personas 目录里的 YAML 全部加载到
内存，按 name 索引。drop 一个新 yaml 调 reload() 即可生效。

YAML 字段（与 AgentConfig 一一对应）：
    name:        str
    persona:     str (中文显示名)
    temperature: float
    max_tokens:  int (default 4096)
    model:       str | null (null → 用 LLMGateway 默认)
    tools:       list[str]
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

import yaml

from sololab.models.agent import AgentConfig

logger = logging.getLogger(__name__)


class PersonaRegistry:
    """从目录自动加载 *.yaml 的 persona 注册中心。"""

    def __init__(self, personas_dir: Optional[Path] = None) -> None:
        self._personas: Dict[str, AgentConfig] = {}
        self._dir = personas_dir or Path(__file__).parent
        self._load_all()

    def _load_all(self) -> None:
        if not self._dir.exists():
            logger.warning("Personas directory not found: %s", self._dir)
            return
        for path in sorted(self._dir.glob("*.yaml")):
            try:
                cfg = self._parse_yaml(path)
                self._personas[cfg.name] = cfg
                logger.info("Loaded persona: %s (%s)", cfg.name, cfg.persona)
            except Exception:
                logger.exception("Failed to load persona: %s", path.name)

    def _parse_yaml(self, path: Path) -> AgentConfig:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return AgentConfig(
            name=data["name"],
            persona=data["persona"],
            temperature=float(data.get("temperature", 0.7)),
            max_tokens=int(data.get("max_tokens", 4096)),
            model=data.get("model"),  # null → None
            tools=list(data.get("tools") or []),
        )

    def reload(self) -> None:
        """重新扫描目录（开发期热插用）。"""
        self._personas.clear()
        self._load_all()

    def get(self, name: str) -> Optional[AgentConfig]:
        return self._personas.get(name)

    def list_all(self) -> List[AgentConfig]:
        return list(self._personas.values())

    def list_names(self) -> List[str]:
        return sorted(self._personas.keys())


# 模块级单例（首次导入即扫描磁盘）
_default_registry: Optional[PersonaRegistry] = None


def get_default_registry() -> PersonaRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = PersonaRegistry()
    return _default_registry
