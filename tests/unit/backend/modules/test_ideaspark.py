"""Unit tests for IdeaSpark module."""

import pytest

from sololab.modules.ideaspark.agents.personas import PERSONAS, get_persona


class TestIdeaSparkPersonas:
    """Tests for Persona Agent configurations."""

    @pytest.mark.unit
    def test_all_personas_defined(self):
        """All 5 personas should be configured."""
        assert len(PERSONAS) == 5

    @pytest.mark.unit
    def test_persona_names_unique(self):
        """Each persona should have a unique name."""
        names = [p.name for p in PERSONAS]
        assert len(names) == len(set(names))

    @pytest.mark.unit
    def test_get_persona_by_name(self):
        """get_persona should find by name."""
        p = get_persona("divergent")
        assert p is not None
        assert p.temperature == 1.0

    @pytest.mark.unit
    def test_divergent_has_search_tools(self):
        """Divergent persona should have web and paper search tools."""
        p = get_persona("divergent")
        assert "web_search" in p.tools
        assert "arxiv_search" in p.tools
