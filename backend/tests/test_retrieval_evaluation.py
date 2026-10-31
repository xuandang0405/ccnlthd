import json
from pathlib import Path

from app.api.public_chat import retrieve_context
from app.core.records import add_record, add_records, make_record
from app.models.entities import Chatbot, ChatbotDocument, Document, DocumentChunk, Organization
from app.services.documents import normalize_search_text, search_tokens
from tests.conftest import get_test_database


async def test_catalog_retrieval_on_small_labeled_dataset():
    """Deterministic retrieval evaluation; no external Gemini request is made."""
    db = get_test_database()
    organization_id = "evaluation-org"
    chatbot_id = "evaluation-bot"
    await add_record(
        db, Organization, make_record(id=organization_id, name="Evaluation", slug="evaluation")
    )
    await add_record(
        db,
        Chatbot,
        make_record(id=chatbot_id, organization_id=organization_id, name="Evaluation Bot"),
    )
    document = make_record(
        organization_id=organization_id,
        original_name="catalog-evaluation.xlsx",
        storage_key="test/catalog-evaluation.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=100,
        status="DONE",
        approval_status="APPROVED",
    )
    document = await add_record(db, Document, document)
    await add_record(
        db,
        ChatbotDocument,
        make_record(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            document_id=document["id"],
        ),
    )
    products = [
        ("Intel Arc B580 12GB", 8_990_000),
        ("Gigabyte RTX 4060 8GB", 11_990_000),
        ("Logitech K250", 399_000),
    ]
    contents = [f"Tên sản phẩm: {name} | Giá (VNĐ): {price}" for name, price in products]
    await add_records(
        db,
        DocumentChunk,
        [
            make_record(
                organization_id=organization_id,
                document_id=document["id"],
                chunk_index=index,
                content=content,
                search_text=normalize_search_text(content),
                search_tokens=search_tokens(content),
            )
            for index, content in enumerate(contents)
        ],
    )

    cases = json.loads(
        (Path(__file__).parent / "data" / "retrieval_cases.json").read_text(encoding="utf-8")
    )
    correct = 0
    for case in cases:
        context, sources, matched = await retrieve_context(
            db, organization_id, chatbot_id, case["question"]
        )
        expected = case["expected_product"]
        if expected is None:
            correct += not matched
        else:
            correct += matched and context.startswith(f"Tên sản phẩm: {expected}")
            assert sources[0].document_name == "catalog-evaluation.xlsx"

    assert correct == len(cases), f"Retrieval accuracy: {correct}/{len(cases)}"
