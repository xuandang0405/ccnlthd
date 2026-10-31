import pytest

from app.services.retrieval import important_question_terms, score_chunk

pytestmark = pytest.mark.no_db


def test_exact_product_and_model_number_are_confident():
    terms = important_question_terms("Intel Arc B580 12GB giá bao nhiêu?")
    result = score_chunk({"content": "Tên sản phẩm: Intel Arc B580 12GB | Giá: 8990000"}, terms)

    assert result is not None
    assert result[1] is True


def test_different_model_number_is_not_confident():
    terms = important_question_terms("Intel Arc B9999 24GB giá bao nhiêu?")
    result = score_chunk({"content": "Tên sản phẩm: Intel Arc B580 12GB | Giá: 8990000"}, terms)

    assert result is not None
    assert result[1] is False
