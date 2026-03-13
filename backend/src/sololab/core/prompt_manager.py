"""提示词管理器 - LLM 提示词模板的加载与渲染。"""

from typing import Any, Dict, Optional


class PromptManager:
    """管理模块和智能体的提示词模板。"""

    def __init__(self) -> None:
        self._templates: Dict[str, str] = {}

    def register_template(self, name: str, template: str) -> None:
        """注册提示词模板。"""
        self._templates[name] = template

    def render(self, name: str, variables: Dict[str, Any] = {}) -> str:
        """使用变量渲染模板。"""
        template = self._templates.get(name)
        if not template:
            raise ValueError(f"Template '{name}' not found")
        return template.format(**variables)

    def get_template(self, name: str) -> Optional[str]:
        """获取原始模板字符串。"""
        return self._templates.get(name)

    def list_templates(self) -> list[str]:
        """列出所有已注册的模板名称。"""
        return list(self._templates.keys())
