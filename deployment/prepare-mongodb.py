import asyncio

from app.core.mongodb import close_mongo_client, ensure_mongo_indexes, get_mongo_database


async def main() -> int:
    try:
        await get_mongo_database().command("ping")
        await ensure_mongo_indexes()
        print("      MongoDB Atlas da ket noi.")
        return 0
    except Exception as exc:
        print(f"      [LOI MONGODB] {exc}")
        print("      Kiem tra Atlas Network Access / IP Access List va ket noi Internet.")
        return 1
    finally:
        await close_mongo_client()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
