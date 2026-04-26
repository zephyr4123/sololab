"""IdeaSpark Phase 集合 —— Strategy 模式。

每个 Phase 是独立的策略对象，pipeline 通过列表组合调度。
新增 phase（如 ResearcherPhase）只需写一个类，然后插入 pipeline.phases 列表。
"""

from sololab.modules.ideaspark.phases.base import Phase, PhaseContext, PhaseEvent
from sololab.modules.ideaspark.phases.cluster_phase import ClusterPhase
from sololab.modules.ideaspark.phases.separate_phase import SeparatePhase
from sololab.modules.ideaspark.phases.synthesize_phase import SynthesizePhase
from sololab.modules.ideaspark.phases.together_phase import TogetherPhase
from sololab.modules.ideaspark.phases.tournament_phase import TournamentPhase

__all__ = [
    "Phase",
    "PhaseContext",
    "PhaseEvent",
    "SeparatePhase",
    "ClusterPhase",
    "TogetherPhase",
    "SynthesizePhase",
    "TournamentPhase",
]
