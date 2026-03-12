"""API routes for document upload and search."""

from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter()


@router.post("/documents/upload")
async def upload_document(file: UploadFile) -> dict:
    """Upload a document for parsing."""
    # TODO: Save file, trigger DocumentPipeline processing
    return {"doc_id": "placeholder", "filename": file.filename, "status": "processing"}


@router.get("/documents/{doc_id}/status")
async def get_document_status(doc_id: str) -> dict:
    """Get document parsing status."""
    # TODO: Query document status from DB
    raise HTTPException(404, f"Document '{doc_id}' not found")


@router.get("/documents/{doc_id}/chunks")
async def get_document_chunks(doc_id: str) -> dict:
    """Get parsed document chunks."""
    # TODO: Return chunks from DB
    raise HTTPException(404, f"Document '{doc_id}' not found")


@router.post("/documents/search")
async def search_documents(query: str, top_k: int = 5) -> dict:
    """Semantic search across all documents."""
    # TODO: Vector search via MemoryManager
    return {"query": query, "results": []}
