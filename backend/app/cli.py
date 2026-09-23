import argparse
import asyncio

from app.core.mongodb import close_mongo_client, get_mongo_database


async def promote_admin(email: str) -> None:
    db = get_mongo_database()
    try:
        result = await db.users.update_one(
            {"email": email.lower()}, {"$set": {"is_super_admin": True}}
        )
        if result.matched_count == 0:
            raise SystemExit("Không tìm thấy tài khoản")
        print(f"Đã cấp SUPER_ADMIN cho {email.lower()}")  # noqa: T201
    finally:
        await close_mongo_client()


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Sales Assistant administration")
    subparsers = parser.add_subparsers(dest="command", required=True)
    promote = subparsers.add_parser("promote-admin")
    promote.add_argument("email")
    args = parser.parse_args()
    if args.command == "promote-admin":
        asyncio.run(promote_admin(args.email))


if __name__ == "__main__":
    main()
