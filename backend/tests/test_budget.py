import pytest

from app.services.budget import budget_guidance, budget_limit, money_value
from app.services.fallback_chat import build_fallback_reply
from app.services.retrieval import important_question_terms

pytestmark = pytest.mark.no_db


@pytest.mark.parametrize(
    "question",
    [
        "Tư vấn laptop tầm 19tr",
        "Ngân sách 19 triệu mua laptop gì?",
        "Laptop tối đa 19.000.000đ",
        "Tìm laptop không quá 19,000,000 VND",
        "Laptop từ 15tr đến 19tr",
        "Tầm 19 triệu, Acer 20 triệu có phù hợp không?",
    ],
)
def test_budget_reads_vietnamese_money_without_raising_limit(question):
    assert budget_limit(question) == 19_000_000


@pytest.mark.parametrize(
    "question",
    [
        "Acer giá 19 triệu phải không?",
        "RTX 4060 8GB có không?",
        "AV17 giá bao nhiêu?",
    ],
)
def test_product_price_checks_and_model_numbers_are_not_budgets(question):
    assert budget_limit(question) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("19,89 triệu", 19_890_000),
        ("19.890.000 VNĐ", 19_890_000),
        ("18990000", 18_990_000),
        ("10.000 - 20.000 VNĐ", None),
        ("", None),
    ],
)
def test_price_parsing_does_not_concatenate_ranges(text, expected):
    assert money_value(text) == expected


def test_ui06_calculates_the_exact_budget_violation():
    guidance = budget_guidance("Tư vấn laptop ngân sách 19tr", "Giá (VNĐ): 19890000")
    assert "19.890.000 VNĐ vượt ngân sách 890.000 VNĐ" in guidance
    assert "ràng buộc cứng" in guidance


def test_budget_is_not_mistaken_for_a_product_code():
    terms = important_question_terms("Laptop Acer dưới 19tr")
    assert terms == ["laptop", "acer"]


def test_fallback_only_lists_proven_prices_within_budget():
    context = (
        "Tên sản phẩm: Acer quá ngân sách | Giá (VNĐ): 19890000\n"
        "Tên sản phẩm: Máy chưa có giá | Bảo hành: 24 tháng\n"
        "Tên sản phẩm: Máy đúng ngưỡng | Giá (VNĐ): 19000000 | Bảo hành: 12 tháng\n"
        "Tên sản phẩm: Máy rẻ hơn | Giá (VNĐ): 18990000"
    )
    reply = build_fallback_reply("Ngân sách 19tr mua gì?", context, True)
    assert "Máy đúng ngưỡng" in reply and "Máy rẻ hơn" in reply
    assert "Acer quá ngân sách" not in reply and "Máy chưa có giá" not in reply
    assert "Bảo hành: 12 tháng" in reply


def test_fallback_says_when_there_is_no_affordable_product():
    reply = build_fallback_reply(
        "Ngân sách 19tr mua gì?", "Tên sản phẩm: Acer | Giá (VNĐ): 19890000", True
    )
    assert "Chưa tìm thấy" in reply and "19.000.000 VNĐ" in reply
    assert "**Acer**" not in reply
