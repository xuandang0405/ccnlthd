import argparse
import asyncio

from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.entities import User


async def promote_admin(email: str) -> None:
    async with SessionFactory() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            raise SystemExit("Không tìm thấy tài khoản")
        user.is_super_admin = True
        await db.commit()
        print(f"Đã cấp SUPER_ADMIN cho {user.email}")  # noqa: T201


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
