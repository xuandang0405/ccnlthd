"""Probe FastAPI độc lập: không phải endpoint sản phẩm, không kết nối MySQL."""

import argparse
import asyncio
import importlib.metadata
import inspect
import json
import os
import sys
import threading
from pathlib import Path

from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field

probe = FastAPI()
events: list[str] = []


async def shared():
    events.append("shared enter")
    try:
        yield object()
    finally:
        events.append("shared exit")


async def left(value=Depends(shared, scope="function")):
    events.append("left")
    return value


async def right(value=Depends(shared, scope="function")):
    events.append("right")
    return value


@probe.get("/cached")
async def cached(a=Depends(left), b=Depends(right)):
    events.append("endpoint")
    return {"same_instance": a is b}


@probe.get("/uncached")
async def uncached(
    a=Depends(shared, scope="function"),
    b=Depends(shared, use_cache=False, scope="function"),
):
    events.append("endpoint")
    return {"same_instance": a is b}


@probe.get("/async-thread")
async def async_thread():
    return {"thread": threading.current_thread().name, "thread_id": threading.get_ident()}


@probe.get("/sync-thread")
def sync_thread():
    return {"thread": threading.current_thread().name, "thread_id": threading.get_ident()}


class Quantity(BaseModel):
    quantity: int = Field(gt=0)


@probe.post("/quantity")
async def quantity(payload: Quantity):
    return payload


async def run_probe() -> dict:
    result = {"scope": "standalone_fake_dependency_no_database", "requests": []}
    async with AsyncClient(transport=ASGITransport(app=probe), base_url="http://probe") as client:
        for path in ("/cached", "/uncached", "/cached", "/async-thread", "/sync-thread"):
            events.clear()
            response = await client.get(path)
            result["requests"].append(
                {
                    "path": path,
                    "status": response.status_code,
                    "body": response.json(),
                    "events": list(events),
                }
            )
        invalid = await client.post("/quantity", json={"quantity": "not-an-integer"})
        result["invalid_input"] = {"status": invalid.status_code, "body": invalid.json()}
    rows = result["requests"]
    assert rows[0]["body"]["same_instance"] is True
    assert rows[0]["events"] == ["shared enter", "left", "right", "endpoint", "shared exit"]
    assert rows[1]["body"]["same_instance"] is False
    assert rows[1]["events"].count("shared enter") == 2
    assert rows[2]["events"] == rows[0]["events"]
    assert rows[3]["body"]["thread_id"] != rows[4]["body"]["thread_id"]
    assert invalid.status_code == 422
    return result


def save_evidence(output: Path, result: dict) -> None:
    # Chỉ đọc graph/schema của app thật; URL SQLite tạm ngăn đọc DB nghiệp vụ.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ.update(
        APP_ENV="test",
        DATABASE_BACKEND="sql",
        DATABASE_URL="sqlite+aiosqlite://",
        RATE_LIMIT_BACKEND="memory",
    )
    from fastapi.dependencies.utils import solve_dependencies
    from fastapi.routing import run_endpoint_function
    from starlette.concurrency import run_in_threadpool

    from app.api.public_chat import router, send_message
    from app.main import app

    def dependency(node):
        return {
            "name": getattr(node.call, "__name__", type(node.call).__name__),
            "use_cache": node.use_cache,
            "scope": getattr(node, "scope", None),
            "children": [dependency(child) for child in node.dependencies],
        }

    route = next(
        route for route in router.routes if getattr(route, "endpoint", None) is send_message
    )
    result["application_graph_read_only"] = dependency(route.dependant)
    result["python"] = sys.version
    result["versions"] = {
        name: importlib.metadata.version(name)
        for name in (
            "fastapi",
            "starlette",
            "pydantic",
            "pydantic-core",
            "sqlalchemy",
            "aiomysql",
            "alembic",
        )
    }
    result["framework_sources"] = {
        function.__name__: {
            "file": inspect.getsourcefile(function),
            "line": inspect.getsourcelines(function)[1],
        }
        for function in (run_endpoint_function, solve_dependencies, run_in_threadpool)
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "mechanisms.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "openapi.json").write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    save_evidence(parser.parse_args().output, asyncio.run(run_probe()))
