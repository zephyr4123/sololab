"""Template registry — auto-discovers and loads YAML template files.

Hot-pluggable: drop a new .yaml file into the templates directory
and the registry picks it up on next reload.
"""
from __future__ import annotations

import logging
from pathlib import Path

import yaml

from sololab.modules.writer.templates.base import CitationStyle, PaperTemplate, SectionTemplate

logger = logging.getLogger(__name__)


class TemplateRegistry:
    """Registry that auto-loads paper templates from YAML files."""

    def __init__(self, templates_dir: str | Path) -> None:
        self._templates: dict[str, PaperTemplate] = {}
        self._templates_dir = Path(templates_dir)
        self._load_all()

    def _load_all(self) -> None:
        """Scan templates directory and load all YAML files."""
        if not self._templates_dir.exists():
            logger.warning("Templates directory not found: %s", self._templates_dir)
            return

        for yaml_path in sorted(self._templates_dir.glob("*.yaml")):
            try:
                template = self._parse_yaml(yaml_path)
                self._templates[template.id] = template
                logger.info("Loaded template: %s (%s)", template.id, template.name)
            except Exception:
                logger.exception("Failed to load template: %s", yaml_path.name)

    def _parse_yaml(self, path: Path) -> PaperTemplate:
        """Parse a YAML file into a PaperTemplate."""
        data = yaml.safe_load(path.read_text(encoding="utf-8"))

        sections = []
        for s in data.get("sections", []):
            sections.append(
                SectionTemplate(
                    type=s["type"],
                    title=s["title"],
                    required=s.get("required", True),
                    max_words=s.get("max_words"),
                    guidelines=s.get("guidelines"),
                    auto_generated=s.get("auto_generated", False),
                )
            )

        citation_data = data.get("citation", {})
        citation = CitationStyle(
            style=citation_data.get("style", "nature-numeric"),
            format=citation_data.get(
                "format",
                "{authors}. {title}. _{venue}_ **{volume}**, {pages} ({year}).",
            ),
            max_authors=citation_data.get("max_authors", 5),
        )

        return PaperTemplate(
            id=data["id"],
            name=data["name"],
            language_default=data.get("language_default", "en"),
            sections=sections,
            citation=citation,
            page_limit=data.get("page_limit"),
            word_template=data.get("word_template"),
        )

    def get(self, template_id: str) -> PaperTemplate | None:
        """Get a template by ID."""
        return self._templates.get(template_id)

    def list_all(self) -> list[PaperTemplate]:
        """Return all loaded templates."""
        return list(self._templates.values())

    def list_ids(self) -> list[str]:
        """Return all template IDs."""
        return list(self._templates.keys())

    def reload(self) -> None:
        """Reload all templates from disk."""
        self._templates.clear()
        self._load_all()
