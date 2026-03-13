"""IdeaSpark 角色智能体配置。"""

from sololab.models.agent import AgentConfig

# 5 个差异化角色智能体
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
    """根据名称获取角色配置。"""
    return next((p for p in PERSONAS if p.name == name), None)
