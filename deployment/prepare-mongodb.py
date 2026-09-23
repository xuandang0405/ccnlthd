import asyncio

from app.core.mongodb import close_mongo_client, ensure_mongo_indexes, get_mongo_database


async def main() -> None:
    try:
        await get_mongo_database().command("ping")
        await ensure_mongo_indexes()
    finally:
        await close_mongo_client()


if __name__ == "__main__":
    asyncio.run(main())
