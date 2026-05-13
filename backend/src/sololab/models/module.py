"""模块 API 请求体。"""

from typing import Any, Dict, Optional

from pydantic import BaseModel


class ModuleRunRequest(BaseModel):
    """模块运行请求。"""

    input: str
    params: Dict[str, Any] = {}
    session_id: Optional[str] = None
    model: Optional[str] = None
