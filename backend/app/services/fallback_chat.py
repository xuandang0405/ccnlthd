import re


def _format_price(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if digits and len(digits) >= 3:
        return f"{int(digits):,}".replace(",", ".") + " VNĐ"
    return value


def _catalog_items(context: str, limit: int = 3) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in context.splitlines():
        if "Tên sản phẩm:" not in line:
            continue
        fields: dict[str, str] = {}
        for part in line.split(" | "):
            if ":" not in part:
                continue
            key, value = part.split(":", 1)
            fields[key.strip()] = value.strip()
        name = fields.get("Tên sản phẩm")
        if not name or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        items.append(fields)
        if len(items) >= limit:
            break
    return items


def build_fallback_reply(question: str, context: str, match_found: bool) -> str:
    items = _catalog_items(context)
    if match_found and items:
        opening = "Mình tìm thấy thông tin này trong dữ liệu của cửa hàng:"
    elif not match_found:
        opening = (
            "Hiện tại website chưa có sản phẩm bạn đang tìm hoặc dữ liệu chưa được cập nhật."
        )
    elif context.strip():
        excerpt = " ".join(context.split())[:500]
        return (
            "Trợ lý AI đang tạm quá tải. Đây là thông tin trực tiếp từ dữ liệu cửa hàng:\n\n"
            f"{excerpt}\n\nBạn vui lòng thử lại sau ít phút để được tư vấn chi tiết hơn."
        )
    else:
        return (
            "Trợ lý AI đang tạm quá tải và chưa tìm thấy dữ liệu phù hợp với câu hỏi này. "
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
    lines.extend(
        [
            "",
            "*Gemini đang tạm quá tải nên thông tin trên được lấy trực tiếp từ dữ liệu "
            "đã cập nhật và lượt chat này không bị trừ.*",
        ]
    )
    return "\n".join(lines)
