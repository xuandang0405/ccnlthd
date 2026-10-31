import argparse
import asyncio

from sqlalchemy import update

from app.core.database import SessionFactory, engine
from app.models.entities import User


async def promote_admin(email: str) -> None:
    try:
        async with SessionFactory.begin() as db:
            result = await db.execute(
                update(User).where(User.email == email.lower()).values(is_super_admin=True)
            )
            if result.rowcount == 0:
                raise SystemExit("Không tìm thấy tài khoản")
        print(f"Đã cấp SUPER_ADMIN cho {email.lower()}")  # noqa: T201
    finally:
        await engine.dispose()


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
