from app.services.fallback_chat import build_fallback_reply


def test_fallback_formats_matching_catalog_item():
    context = (
        "[Trang tính: Sản phẩm | Dòng 6] Danh mục: Bàn phím | "
        "Tên sản phẩm: Bàn phím Bluetooth Logitech K250 | Giá (VNĐ): 399000 | "
        "Cửa hàng: CellphoneS | Tình trạng: Còn hàng"
    )

    reply = build_fallback_reply("Logitech K250 giá bao nhiêu?", context, True)

    assert "**Bàn phím Bluetooth Logitech K250**" in reply
    assert "**Giá: 399.000 VNĐ**" in reply
    assert "lượt chat này không bị trừ" in reply


def test_fallback_reports_missing_product_and_suggests_existing_item():
    context = (
        "[Trang tính: Sản phẩm | Dòng 31] Danh mục: Card đồ họa | "
        "Tên sản phẩm: Gigabyte RTX 4060 | Giá (VNĐ): 11990000"
    )

    reply = build_fallback_reply("Intel Arc B580 có bán không?", context, False)

    assert "chưa có sản phẩm" in reply
    assert "Gigabyte RTX 4060" in reply
