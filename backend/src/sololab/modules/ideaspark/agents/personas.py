"""IdeaSpark 角色智能体配置。"""

from sololab.models.agent import AgentConfig

# 5 个差异化角色智能体
# model=None 表示使用 settings.py 中的 default_model
PERSONAS: list[AgentConfig] = [
    AgentConfig(
        name="divergent",
        persona="发散者",
        temperature=1.0,
        tools=["web_search", "arxiv_search"],
        model=None,
    ),
    AgentConfig(
        name="expert",
        persona="领域专家",
        temperature=0.5,
        tools=["arxiv_search", "scholar_search", "doc_parse"],
        model=None,
    ),
    AgentConfig(
        name="critic",
        persona="审辩者",
        temperature=0.3,
        tools=["arxiv_search"],  # scholar_search 免费 API 限流严重，暂用 arxiv 替代
        model=None,
    ),
    AgentConfig(
        name="connector",
        persona="整合者",
        temperature=0.7,
        tools=[],
        model=None,
    ),
    AgentConfig(
        name="evaluator",
        persona="评审者",
        temperature=0.3,
        tools=[],
        model=None,
    ),
]


def get_persona(name: str) -> AgentConfig | None:
    """根据名称获取角色配置。"""
    return next((p for p in PERSONAS if p.name == name), None)
