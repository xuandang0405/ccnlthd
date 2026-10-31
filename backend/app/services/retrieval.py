"""Tìm nội dung đã duyệt để chatbot trả lời câu hỏi của khách.

API gọi ``retrieve_context`` trước khi nhờ Gemini viết câu trả lời. Module này
chỉ tìm trong tài liệu đã được duyệt của đúng doanh nghiệp.
"""

from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    ChatbotDocument,
    Document,
    DocumentChunk,
    DocumentChunkToken,
    DocumentStatus,
)
from app.schemas.public_chat import SourceReference
from app.services.budget import product_question
from app.services.documents import normalize_search_text, search_tokens

QUESTION_FILLER_WORDS = {
    "bao",
    "ban",
    "cho",
    "chua",
    "con",
    "cua",
    "dang",
    "duoc",
    "gia",
    "hien",
    "khong",
    "minh",
    "nao",
    "nhieu",
    "pham",
    "san",
    "tai",
    "trang",
    "tren",
    "toi",
    "voi",
    "website",
}


def important_question_terms(question: str) -> list[str]:
    """Bỏ từ thông dụng để ưu tiên tên và mã sản phẩm."""
    return [
        term for term in search_tokens(product_question(question), limit=20)
        if term not in QUESTION_FILLER_WORDS
    ][:12]


def term_weight(term: str) -> int:
    """Mã có chữ số quan trọng hơn các từ mô tả chung."""
    return 5 if any(character.isdigit() for character in term) else 2


def score_chunk(chunk: dict[str, Any], terms: list[str]) -> tuple[float, bool] | None:
    """Trả điểm xếp hạng và kết luận đoạn này có khớp sản phẩm không."""
    content_tokens = set(search_tokens(chunk["content"], limit=2000))
    matched = [term for term in terms if term in content_tokens]
    if not matched:
        return None

    total_weight = sum(term_weight(term) for term in terms)
    coverage = sum(term_weight(term) for term in matched) / total_weight
    normalized_content = chunk.get("search_text") or normalize_search_text(chunk["content"])
    adjacent_matches = sum(
        1
        for left, right in zip(terms, terms[1:], strict=False)
        if f"{left} {right}" in normalized_content
    )
    model_numbers = [term for term in terms if any(character.isdigit() for character in term)]
    confident = coverage >= 0.6 and all(term in content_tokens for term in model_numbers)
    score = coverage * 100 + adjacent_matches * 12 + (35 if len(matched) == len(terms) else 0)
    return score, confident


async def retrieve_context(
    db: AsyncSession, organization_id: str, chatbot_id: str, question: str
) -> tuple[str, list[SourceReference], bool]:
    """Chỉ tìm trong tài liệu đã duyệt và được gắn với chatbot của đúng doanh nghiệp."""
    terms = important_question_terms(question)
    approved_documents = (
        await db.scalars(
            select(Document)
            .join(ChatbotDocument, ChatbotDocument.document_id == Document.id)
            .where(
                Document.organization_id == organization_id,
                ChatbotDocument.organization_id == organization_id,
                ChatbotDocument.chatbot_id == chatbot_id,
                Document.status == DocumentStatus.DONE,
                Document.approval_status == "APPROVED",
            )
        )
    ).all()
    documents_by_id = {item.id: item for item in approved_documents}
    if not documents_by_id:
        return "", [], False

    chunk_query = select(DocumentChunk).where(
        DocumentChunk.organization_id == organization_id,
        DocumentChunk.document_id.in_(documents_by_id),
    )
    candidate_chunks = []
    if terms:
        # Xếp hạng trước LIMIT để sản phẩm ở cuối file lớn không bị bỏ sót.
        token_scores = (
            select(
                DocumentChunkToken.chunk_id,
                func.sum(
                    case(
                        *[(DocumentChunkToken.token == term, term_weight(term)) for term in terms],
                        else_=0,
                    )
                ).label("score"),
            )
            .where(
                DocumentChunkToken.token.in_(terms),
                DocumentChunkToken.chunk_id.in_(chunk_query.with_only_columns(DocumentChunk.id)),
            )
            .group_by(DocumentChunkToken.chunk_id)
            .subquery()
        )
        candidate_chunks = (
            await db.scalars(
                chunk_query.join(token_scores, token_scores.c.chunk_id == DocumentChunk.id)
                .order_by(token_scores.c.score.desc(), DocumentChunk.chunk_index, DocumentChunk.id)
                .limit(400)
            )
        ).all()
        # Tài liệu cũ chưa có chỉ mục vẫn phải được tìm, kể cả khi có tài liệu mới.
        has_token_index = (
            select(DocumentChunkToken.chunk_id)
            .where(DocumentChunkToken.chunk_id == DocumentChunk.id)
            .exists()
        )
        text_matches = [DocumentChunk.search_text.contains(term, autoescape=True) for term in terms]
        text_score = sum(
            case((condition, term_weight(term)), else_=0)
            for condition, term in zip(text_matches, terms, strict=True)
        )
        legacy_chunks = (
            await db.scalars(
                chunk_query.where(~has_token_index, or_(*text_matches))
                .order_by(text_score.desc(), DocumentChunk.chunk_index, DocumentChunk.id)
                .limit(300)
            )
        ).all()
        candidate_chunks = [*candidate_chunks, *legacy_chunks]

    ranked_chunks = []
    for chunk in candidate_chunks:
        result = score_chunk(chunk.as_dict(), terms)
        if result is not None:
            score, confident = result
            ranked_chunks.append((score, confident, chunk))
    ranked_chunks.sort(key=lambda entry: (-entry[0], entry[2].chunk_index))
    match_found = bool(ranked_chunks and ranked_chunks[0][1])
    selected_chunks = [entry[2] for entry in ranked_chunks[:6]]
    if not selected_chunks:
        selected_chunks = (
            await db.scalars(chunk_query.order_by(DocumentChunk.chunk_index).limit(4))
        ).all()

    context = "\n\n".join(chunk.content for chunk in selected_chunks)
    source_ids = dict.fromkeys(chunk.document_id for chunk in selected_chunks)
    sources = [
        SourceReference(
            document_id=document_id, document_name=documents_by_id[document_id].original_name
        )
        for document_id in source_ids
    ]
    return context, sources, match_found
