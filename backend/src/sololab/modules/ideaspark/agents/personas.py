"""Persona Agent configurations for IdeaSpark."""

from sololab.models.agent import AgentConfig

# 5 differentiated Persona Agents
PERSONAS: list[AgentConfig] = [
    AgentConfig(
        name="divergent",
        persona="Divergent Thinker",
        temperature=1.0,
        tools=["web_search", "arxiv_search"],
        model="divergent",
    ),
    AgentConfig(
        name="expert",
        persona="Domain Expert",
        temperature=0.5,
        tools=["arxiv_search", "scholar_search", "doc_parse"],
        model="reasoning",
    ),
    AgentConfig(
        name="critic",
        persona="Critic",
        temperature=0.3,
        tools=["scholar_search"],
        model="reasoning",
    ),
    AgentConfig(
        name="connector",
        persona="Connector",
        temperature=0.7,
        tools=[],
        model="reasoning",
    ),
    AgentConfig(
        name="evaluator",
        persona="Evaluator",
        temperature=0.3,
        tools=[],
        model="reasoning",
    ),
]


def get_persona(name: str) -> AgentConfig | None:
    """Get a persona configuration by name."""
    return next((p for p in PERSONAS if p.name == name), None)
