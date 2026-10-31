"""Đọc hạn mức VND và tính chênh lệch trước khi nhờ mô hình diễn đạt."""

import re
import unicodedata
from decimal import Decimal, InvalidOperation

MONEY = re.compile(
    r"(?<![\w-])(?P<value>\d+(?:[.,]\d+)*)\s*"
    r"(?P<unit>trieu|tr|nghin|ngan|k|vnd|dong|d|₫)(?!\w)"
)


def plain_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold().replace("đ", "d"))
    return "".join(character for character in text if not unicodedata.combining(character))


def money_value(value: str) -> int | None:
    text = plain_text(value.strip())
    match = MONEY.fullmatch(text)
    number = match["value"] if match else text
    unit = match["unit"] if match else "vnd"
    multiplier = (
        1_000_000 if unit in {"trieu", "tr"} else (1000 if unit in {"nghin", "ngan", "k"} else 1)
    )
    if multiplier == 1:
        if not re.fullmatch(r"\d+|\d{1,3}(?:[.,]\d{3})+", number):
            return None
        number = number.replace(".", "").replace(",", "")
    try:
        amount = Decimal(number.replace(",", ".")) * multiplier
    except InvalidOperation:
        return None
    return int(amount) if amount == int(amount) and 0 < amount <= 1_000_000_000_000 else None


def budget_limit(question: str) -> int | None:
    text = plain_text(question)
    # Hỏi lại giá một mẫu cụ thể không đồng nghĩa với đặt ngân sách mua hàng.
    shopping = re.search(
        r"\b(ngan sach|toi da|khong qua|duoi|tam|khoang|mua|tu van|goi y|tim|chon)\b", text
    )
    if re.search(r"\bgia\b", text) and not shopping:
        return None
    amounts = list(MONEY.finditer(text))
    if not amounts:
        return None
    # Với khoảng 'từ 15tr đến 19tr', dùng đầu trên; thông thường dùng mức đầu tiên.
    amount = amounts[-1] if re.search(r"\btu\b.+\bden\b", text) else amounts[0]
    return money_value(amount[0])


def format_vnd(amount: int) -> str:
    return f"{amount:,}".replace(",", ".") + " VNĐ"


def product_question(question: str) -> str:
    if budget_limit(question) is None:
        return question
    text = MONEY.sub(" ", plain_text(question))
    # 19tr là mức chi, không phải mã sản phẩm phải khớp trong tài liệu.
    return re.sub(r"\b(ngan sach|toi da|khong qua|duoi|tam|khoang|tu|den)\b", " ", text)


def budget_guidance(question: str, context: str) -> str:
    limit = budget_limit(question)
    if limit is None:
        return ""
    text = plain_text(context)
    prices = {money_value(match[0]) for match in MONEY.finditer(text)}
    for match in re.finditer(r"(?:gia(?: ban)?|don gia)\s*(?:\([^)]*\))?\s*:\s*([\d.,]+)", text):
        prices.add(money_value(match[1]))
    comparisons = []
    for price in sorted(value for value in prices if value is not None)[:20]:
        difference = price - limit
        comparisons.append(
            f"{format_vnd(price)} vượt ngân sách {format_vnd(difference)}"
            if difference > 0
            else f"{format_vnd(price)} không vượt ngân sách"
        )
    return (
        f" Ngân sách tối đa của khách: {format_vnd(limit)}. "
        "Đây là ràng buộc cứng, kể cả khi khách nói 'tầm' hoặc 'khoảng'. "
        "Chỉ gọi một mẫu là phù hợp ngân sách nếu có giá rõ ràng không vượt mức này. "
        "Mẫu cao hơn phải ghi rõ 'vượt ngân sách' và số tiền chênh lệch; không được coi là "
        "lựa chọn phù hợp hoặc tự tăng ngân sách. Không đủ mẫu thì nói rõ chưa tìm thấy "
        "lựa chọn đáp ứng trong dữ liệu, không tự bịa mẫu rẻ hơn hay suy đoán bảo hành. "
        "Phép tính tham khảo (không phải danh sách sản phẩm): " + "; ".join(comparisons) + "."
    )
