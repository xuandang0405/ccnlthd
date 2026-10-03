import json
from pathlib import Path

from app.api.public_chat import retrieve_context
from app.core.mongodb import get_mongo_database, new_document
from app.services.documents import normalize_search_text, search_tokens


async def test_catalog_retrieval_on_small_labeled_dataset():
    """Deterministic retrieval evaluation; no external Gemini request is made."""
    db = get_mongo_database()
    organization_id = "evaluation-org"
    chatbot_id = "evaluation-bot"
    document = new_document(
        organization_id=organization_id,
        original_name="catalog-evaluation.xlsx",
        status="DONE",
        approval_status="APPROVED",
    )
    await db.documents.insert_one(document)
    await db.chatbot_documents.insert_one(
        new_document(
            organization_id=organization_id,
            chatbot_id=chatbot_id,
            document_id=document["_id"],
        )
    )
    products = [
        ("Intel Arc B580 12GB", 8_990_000),
        ("Gigabyte RTX 4060 8GB", 11_990_000),
        ("Logitech K250", 399_000),
    ]
    contents = [f"Tên sản phẩm: {name} | Giá (VNĐ): {price}" for name, price in products]
    await db.document_chunks.insert_many(
        [
            new_document(
                organization_id=organization_id,
                document_id=document["_id"],
                chunk_index=index,
                content=content,
                search_text=normalize_search_text(content),
                search_tokens=search_tokens(content),
            )
            for index, content in enumerate(contents)
        ]
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
