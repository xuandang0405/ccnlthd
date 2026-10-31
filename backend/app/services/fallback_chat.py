import re

from app.services.budget import budget_limit, format_vnd, money_value


def _format_price(value: str) -> str:
    # Khoảng giá hoặc đơn vị khác phải được giữ nguyên, không ghép mọi chữ số.
    if not re.fullmatch(r"[\d.,\s]+(?:VNĐ|VND|đ|₫)?", value.strip(), re.IGNORECASE):
        return value
    digits = re.sub(r"\D", "", value)
    if digits and len(digits) >= 3:
        return f"{int(digits):,}".replace(",", ".") + " VNĐ"
    return value


def _catalog_items(context: str, limit: int = 3) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    current: dict[str, str] = {}
    aliases = {
        "tên sản phẩm": "Tên sản phẩm",
        "tên hàng": "Tên sản phẩm",
        "mã sản phẩm": "Mã sản phẩm",
        "giá": "Giá (VNĐ)",
        "giá bán": "Giá (VNĐ)",
        "giá (vnđ)": "Giá (VNĐ)",
        "giá (vnd)": "Giá (VNĐ)",
        "đơn giá": "Giá (VNĐ)",
        "cửa hàng": "Cửa hàng",
        "tình trạng": "Tình trạng",
        "bảo hành": "Bảo hành",
    }

    def append_current() -> None:
        name = current.get("Tên sản phẩm")
        if name and name.casefold() not in seen:
            seen.add(name.casefold())
            items.append(current.copy())

    for line in context.splitlines():
        fields: dict[str, str] = {}
        for part in line.split(" | "):
            if ":" not in part:
                continue
            key, value = part.split(":", 1)
            canonical = aliases.get(key.strip().casefold())
            if canonical:
                fields[canonical] = value.strip()
        # Word có nhiều dòng cho một sản phẩm; Excel thường gộp trên một dòng.
        starts_product = ("Tên sản phẩm" in fields and "Tên sản phẩm" in current) or (
            "Mã sản phẩm" in fields and ("Mã sản phẩm" in current or "Giá (VNĐ)" in current)
        )
        if starts_product:
            append_current()
            current = {}
        current.update(fields)
    append_current()
    return items[:limit]


def build_fallback_reply(question: str, context: str, match_found: bool) -> str:
    limit = budget_limit(question)
    items = _catalog_items(context, limit=1000 if limit is not None else 3)
    if limit is not None:
        items = [
            item for item in items
            if (price := money_value(item.get("Giá (VNĐ)", ""))) is not None and price <= limit
        ][:3]
        opening = (
            f"Các mẫu không vượt ngân sách **{format_vnd(limit)}** trong dữ liệu truy xuất:"
            if items else f"Chưa tìm thấy mẫu có giá không vượt **{format_vnd(limit)}** "
            "trong phần dữ liệu truy xuất. Mình chưa thể xác nhận lựa chọn phù hợp ngân sách này."
        )
    elif match_found and items:
        opening = "Mình tìm thấy thông tin này trong dữ liệu của cửa hàng:"
    elif not match_found:
        opening = "Hiện tại website chưa có sản phẩm bạn đang tìm hoặc dữ liệu chưa được cập nhật."
    elif context.strip():
        excerpt = " ".join(context.split())[:500]
        return (
            "Trợ lý AI hiện chưa khả dụng. Đây là thông tin trực tiếp từ dữ liệu cửa hàng:\n\n"
            f"{excerpt}\n\nBạn vui lòng thử lại sau ít phút để được tư vấn chi tiết hơn."
        )
    else:
        return (
            "Trợ lý AI hiện chưa khả dụng và chưa tìm thấy dữ liệu phù hợp với câu hỏi này. "
            "Bạn vui lòng thử lại sau ít phút."
        )

    lines = [opening]
    if items:
        lines.append("")
        for item in items:
            lines.append(f"- **{item['Tên sản phẩm']}**")
            if price := item.get("Giá (VNĐ)"):
                lines.append(f"  + **Giá: {_format_price(price)}**")
            if store := item.get("Cửa hàng"):
                lines.append(f"  + Cửa hàng: {store}")
            if status := item.get("Tình trạng"):
                lines.append(f"  + Tình trạng: {status}")
            if warranty := item.get("Bảo hành"):
                lines.append(f"  + Bảo hành: {warranty}")
    lines.extend(
        [
            "",
            "*Hệ thống đang gặp sự cố khi xử lý dữ liệu. Vui lòng thử lại sau ít phút.*",
        ]
    )
    return "\n".join(lines)
