"""Persona 包 —— 通过 YAML 热插 + Registry 暴露。"""

from sololab.modules.ideaspark.personas.registry import (
    PersonaRegistry,
    get_default_registry,
)

__all__ = ["PersonaRegistry", "get_default_registry"]
