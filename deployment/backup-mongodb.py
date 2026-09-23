import argparse
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from bson.json_util import CANONICAL_JSON_OPTIONS, dumps
from pymongo import MongoClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a MongoDB Extended JSON backup")
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    settings = get_settings()
    if settings.mongodb_uri is None:
        raise SystemExit("MONGODB_URI chưa được cấu hình")
    destination = args.destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    client = MongoClient(settings.mongodb_uri.get_secret_value(), serverSelectionTimeoutMS=10_000)
    try:
        database = client[settings.mongodb_database]
        collections = database.list_collection_names()
        manifest = {
            "format": "mongodb-canonical-extended-json-lines-v1",
            "database": settings.mongodb_database,
            "created_at": datetime.now(UTC).isoformat(),
            "collections": {},
        }
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(collections):
                count = 0
                with archive.open(f"collections/{name}.jsonl", "w") as output:
                    for document in database[name].find({}):
                        line = dumps(document, json_options=CANONICAL_JSON_OPTIONS) + "\n"
                        output.write(line.encode("utf-8"))
                        count += 1
                manifest["collections"][name] = count
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    main()
