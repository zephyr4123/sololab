"""Prompt Manager - Template loading and rendering for LLM prompts."""

from typing import Any, Dict, Optional


class PromptManager:
    """Manages prompt templates for modules and agents."""

    def __init__(self) -> None:
        self._templates: Dict[str, str] = {}

    def register_template(self, name: str, template: str) -> None:
        """Register a prompt template."""
        self._templates[name] = template

    def render(self, name: str, variables: Dict[str, Any] = {}) -> str:
        """Render a template with variables."""
        template = self._templates.get(name)
        if not template:
            raise ValueError(f"Template '{name}' not found")
        return template.format(**variables)

    def get_template(self, name: str) -> Optional[str]:
        """Get raw template string."""
        return self._templates.get(name)

    def list_templates(self) -> list[str]:
        """List all registered template names."""
        return list(self._templates.keys())
