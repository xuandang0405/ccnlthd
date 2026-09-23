from typing import TypedDict


class Product(TypedDict):
    code: str
    name: str
    description: str
    product_type: str
    quantity: int
    price_vnd: int


PRODUCTS: tuple[Product, ...] = (
    {
        "code": "BOT1",
        "name": "Thêm 1 chatbot",
        "description": "Mở thêm một vị trí chatbot vĩnh viễn cho doanh nghiệp.",
        "product_type": "CHATBOT_SLOT",
        "quantity": 1,
        "price_vnd": 200_000,
    },
    {
        "code": "C100",
        "name": "100 lượt",
        "description": "Gói khởi động",
        "product_type": "CHAT_CREDITS",
        "quantity": 100,
        "price_vnd": 49_999,
    },
    {
        "code": "C500",
        "name": "500 lượt",
        "description": "Gói nhỏ",
        "product_type": "CHAT_CREDITS",
        "quantity": 500,
        "price_vnd": 199_999,
    },
    {
        "code": "C1000",
        "name": "1.000 lượt",
        "description": "Gói phổ biến",
        "product_type": "CHAT_CREDITS",
        "quantity": 1_000,
        "price_vnd": 349_999,
    },
    {
        "code": "C2500",
        "name": "2.500 lượt",
        "description": "Gói tăng trưởng",
        "product_type": "CHAT_CREDITS",
        "quantity": 2_500,
        "price_vnd": 799_999,
    },
    {
        "code": "C5000",
        "name": "5.000 lượt",
        "description": "Gói kinh doanh",
        "product_type": "CHAT_CREDITS",
        "quantity": 5_000,
        "price_vnd": 1_499_999,
    },
    {
        "code": "C10000",
        "name": "10.000 lượt",
        "description": "Gói chuyên nghiệp",
        "product_type": "CHAT_CREDITS",
        "quantity": 10_000,
        "price_vnd": 2_799_999,
    },
    {
        "code": "C25000",
        "name": "25.000 lượt",
        "description": "Gói quy mô lớn",
        "product_type": "CHAT_CREDITS",
        "quantity": 25_000,
        "price_vnd": 6_499_999,
    },
    {
        "code": "C50000",
        "name": "50.000 lượt",
        "description": "Gói doanh nghiệp",
        "product_type": "CHAT_CREDITS",
        "quantity": 50_000,
        "price_vnd": 11_999_999,
    },
    {
        "code": "C100000",
        "name": "100.000 lượt",
        "description": "Gói doanh nghiệp Plus",
        "product_type": "CHAT_CREDITS",
        "quantity": 100_000,
        "price_vnd": 21_999_999,
    },
    {
        "code": "C250000",
        "name": "250.000 lượt",
        "description": "Gói đối tác",
        "product_type": "CHAT_CREDITS",
        "quantity": 250_000,
        "price_vnd": 49_999_999,
    },
)

PRODUCTS_BY_CODE = {product["code"]: product for product in PRODUCTS}
