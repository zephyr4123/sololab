"""IdeaSpark 角色配置访问层（向后兼容 shim）。

历史上本文件硬编码了 PERSONAS list。重构后所有 persona 数据移到
`modules/ideaspark/personas/*.yaml`，由 PersonaRegistry 自动加载。
本模块保留 PERSONAS / get_persona 接口，调用方零改动。

新增 persona：在 personas/ 目录新建 yaml 文件即可，无需改代码。
"""

from typing import List, Optional

from sololab.models.agent import AgentConfig
from sololab.modules.ideaspark.personas import get_default_registry


def get_persona(name: str) -> Optional[AgentConfig]:
    """根据名称获取 persona 配置。"""
    return get_default_registry().get(name)


# 兼容旧调用：直接 import PERSONAS（少量测试用）
# 注意这是模块加载时快照，运行时调 reload() 后需重新引用 list_all()
PERSONAS: List[AgentConfig] = get_default_registry().list_all()
