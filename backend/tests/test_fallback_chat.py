import pytest

from app.services.fallback_chat import build_fallback_reply

pytestmark = pytest.mark.no_db


def test_fallback_formats_matching_catalog_item():
    context = (
        "[Trang tính: Sản phẩm | Dòng 6] Danh mục: Bàn phím | "
        "Tên sản phẩm: Bàn phím Bluetooth Logitech K250 | Giá (VNĐ): 399000 | "
        "Cửa hàng: CellphoneS | Tình trạng: Còn hàng"
    )

    reply = build_fallback_reply("Logitech K250 giá bao nhiêu?", context, True)

    assert "**Bàn phím Bluetooth Logitech K250**" in reply
    assert "**Giá: 399.000 VNĐ**" in reply
    assert "Hệ thống đang gặp sự cố khi xử lý dữ liệu" in reply
    assert "gemini" not in reply.casefold()


def test_fallback_reports_missing_product_and_suggests_existing_item():
    context = (
        "[Trang tính: Sản phẩm | Dòng 31] Danh mục: Card đồ họa | "
        "Tên sản phẩm: Gigabyte RTX 4060 | Giá (VNĐ): 11990000"
    )

    reply = build_fallback_reply("Intel Arc B580 có bán không?", context, False)

    assert "chưa có sản phẩm" in reply
    assert "Gigabyte RTX 4060" in reply


@pytest.mark.parametrize("header", ["Giá bán", "Giá", "Đơn giá", "Giá (VND)"])
def test_fallback_reads_price_and_warranty_on_separate_word_lines(header):
    context = (
        "Mã sản phẩm: AV17\nTên sản phẩm: Tai nghe Aurora AV17\n"
        f"{header}: 789.000 VND\nBảo hành: 12 tháng\nTình trạng: Còn hàng"
    )
    reply = build_fallback_reply("AV17 giá bao nhiêu?", context, True)
    assert "**Giá: 789.000 VNĐ**" in reply
    assert "Bảo hành: 12 tháng" in reply

    name_before_code = context.replace(
        "Mã sản phẩm: AV17\nTên sản phẩm: Tai nghe Aurora AV17",
        "Tên sản phẩm: Tai nghe Aurora AV17\nMã sản phẩm: AV17",
    )
    reply = build_fallback_reply("AV17 giá bao nhiêu?", name_before_code, True)
    assert "**Giá: 789.000 VNĐ**" in reply
    assert "Bảo hành: 12 tháng" in reply


def test_fallback_does_not_mix_prices_between_product_blocks():
    context = (
        "Tên sản phẩm: Tai nghe A\nGiá bán: 789000\n"
        "Mã sản phẩm: B29\nTên sản phẩm: Loa B\nGiá bán: 1269000"
    )
    reply = build_fallback_reply("Cho xem sản phẩm", context, False)
    assert "**Tai nghe A**\n  + **Giá: 789.000 VNĐ**" in reply
    assert "**Loa B**\n  + **Giá: 1.269.000 VNĐ**" in reply


def test_fallback_preserves_a_price_range_instead_of_joining_digits():
    context = "Tên sản phẩm: Cáp A | Giá (VNĐ): 10.000 - 20.000 VNĐ"
    reply = build_fallback_reply("Cáp A", context, True)
    assert "10.000 - 20.000 VNĐ" in reply
    assert "100.002.000" not in reply


@pytest.mark.parametrize(
    ("context", "match_found"),
    [
        ("Tên sản phẩm: Đèn A | Giá (VNĐ): 100000", True),
        ("Tên sản phẩm: Đèn A | Giá (VNĐ): 100000", False),
        ("Cửa hàng nhận bảo hành trong giờ hành chính.", True),
        ("", True),
    ],
)
def test_fallback_never_discloses_provider(context, match_found):
    reply = build_fallback_reply("Cửa hàng có gì?", context, match_found)
    assert "gemini" not in reply.casefold()
    assert "GEMINI_API_KEY" not in reply
