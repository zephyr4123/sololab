"""Paper template data models.

Templates are YAML-driven configurations defining paper structure,
citation format, and Word export style. New templates are added by
placing a YAML file in the templates/ directory — the Registry
auto-discovers them.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SectionTemplate:
    """Definition of a single paper section."""

    type: str
    title: str
    required: bool = True
    max_words: int | None = None
    guidelines: str | None = None
    auto_generated: bool = False


@dataclass
class CitationStyle:
    """Citation formatting configuration."""

    style: str
    format: str
    max_authors: int = 5


@dataclass
class PaperTemplate:
    """Complete paper template definition.

    Loaded from YAML files in the templates directory.
    """

    id: str
    name: str
    language_default: str = "en"
    sections: list[SectionTemplate] = field(default_factory=list)
    citation: CitationStyle = field(
        default_factory=lambda: CitationStyle(
            style="nature-numeric",
            format="{authors}. {title}. _{venue}_ **{volume}**, {pages} ({year}).",
        )
    )
    page_limit: int | None = None
    word_template: str | None = None

    def get_section(self, section_type: str) -> SectionTemplate | None:
        """Get a section template by type."""
        for s in self.sections:
            if s.type == section_type:
                return s
        return None

    def required_sections(self) -> list[SectionTemplate]:
        """Return only required (non-auto-generated) sections."""
        return [s for s in self.sections if s.required and not s.auto_generated]

    def to_dict(self) -> dict:
        """Serialize to dict for API responses."""
        return {
            "id": self.id,
            "name": self.name,
            "language_default": self.language_default,
            "sections": [
                {
                    "type": s.type,
                    "title": s.title,
                    "required": s.required,
                    "max_words": s.max_words,
                    "guidelines": s.guidelines,
                    "auto_generated": s.auto_generated,
                }
                for s in self.sections
            ],
            "citation": {
                "style": self.citation.style,
                "format": self.citation.format,
                "max_authors": self.citation.max_authors,
            },
            "page_limit": self.page_limit,
            "word_template": self.word_template,
        }
