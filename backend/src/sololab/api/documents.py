"""文档上传与搜索的 API 路由。"""

from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter()


@router.post("/documents/upload")
async def upload_document(file: UploadFile) -> dict:
    """上传文档进行解析。"""
    # TODO: 保存文件，触发 DocumentPipeline 处理
    return {"doc_id": "placeholder", "filename": file.filename, "status": "processing"}


@router.get("/documents/{doc_id}/status")
async def get_document_status(doc_id: str) -> dict:
    """获取文档解析状态。"""
    # TODO: 从数据库查询文档状态
    raise HTTPException(404, f"Document '{doc_id}' not found")


@router.get("/documents/{doc_id}/chunks")
async def get_document_chunks(doc_id: str) -> dict:
    """获取解析后的文档分块。"""
    # TODO: 从数据库返回分块
    raise HTTPException(404, f"Document '{doc_id}' not found")


@router.post("/documents/search")
async def search_documents(query: str, top_k: int = 5) -> dict:
    """跨所有文档的语义搜索。"""
    # TODO: 通过 MemoryManager 进行向量搜索
    return {"query": query, "results": []}
