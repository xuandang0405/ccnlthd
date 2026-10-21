import json
import re
from dataclasses import asdict, dataclass

PRICE_PATTERN = re.compile(
    r"(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(?:₫|đ|vnd|vnđ|dong)?",
    re.IGNORECASE,
)
PRODUCT_HINTS = (
    "sản phẩm",
    "tên hàng",
    "mã sản phẩm",
    "mã hàng",
    "model",
    "sku",
    "dịch vụ",
)
PRICE_HINTS = ("giá", "đơn giá", "giá bán", "price", "thành tiền")


@dataclass(frozen=True)
class DocumentReview:
    passed: bool
    score: int
    product_signals: int
    price_signals: int
    summary: str
    issues: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def review_catalog(text: str) -> DocumentReview:
    normalized = " ".join(text.lower().split())
    product_signals = sum(normalized.count(hint) for hint in PRODUCT_HINTS)
    price_headers = sum(normalized.count(hint) for hint in PRICE_HINTS)
    price_values = len(PRICE_PATTERN.findall(normalized))
    price_signals = price_headers + min(price_values, 20)
    issues: list[str] = []
    if len(normalized) < 40:
        issues.append("Nội dung trích xuất quá ngắn")
    if product_signals == 0:
        issues.append("Chưa nhận diện được cột hoặc mô tả sản phẩm")
    if price_headers == 0:
        issues.append("Chưa nhận diện được tiêu đề giá")
    if price_values == 0:
        issues.append("Chưa nhận diện được giá trị giá")
    score = min(100, 25 + product_signals * 15 + price_headers * 15 + min(price_values, 10) * 5)
    passed = not issues and score >= 70
    summary = f"Nhận diện {product_signals} tín hiệu sản phẩm và {price_values} giá trị giá. " + (
        "Đủ điều kiện tự động duyệt." if passed else "Cần Admin kiểm tra thủ công."
    )
    return DocumentReview(
        passed=passed,
        score=score,
        product_signals=product_signals,
        price_signals=price_signals,
        summary=summary,
        issues=issues,
    )


async def review_catalog_with_ai(text: str) -> DocumentReview:
    from app.integrations.gemini import GeminiService, GeminiServiceError

    sample = text[:12_000]
    baseline = review_catalog(sample)
    try:
        result = json.loads(await GeminiService().review_document(sample))
        if not isinstance(result, dict) or not isinstance(result.get("passed"), bool):
            raise ValueError("Kết quả duyệt thiếu trạng thái")
        score = result.get("score")
        summary = result.get("summary")
        issues = result.get("issues")
        if (
            not isinstance(score, int)
            or isinstance(score, bool)
            or not 0 <= score <= 100
            or not isinstance(summary, str)
            or not summary.strip()
            or not isinstance(issues, list)
            or not all(isinstance(item, str) for item in issues)
        ):
            raise ValueError("Kết quả duyệt không đúng cấu trúc")
    except (ValueError, TypeError) as exc:
        raise GeminiServiceError("Gemini trả kết quả kiểm duyệt không hợp lệ") from exc
    return DocumentReview(
        passed=result["passed"] and score >= 70 and not issues,
        score=score,
        product_signals=baseline.product_signals,
        price_signals=baseline.price_signals,
        summary=summary.strip(),
        issues=issues,
    )
