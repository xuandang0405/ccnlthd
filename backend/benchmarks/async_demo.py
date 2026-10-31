"""Phòng thử riêng; không import vào app chính và không truy cập dữ liệu người dùng."""

import asyncio
import time

from fastapi import FastAPI

app = FastAPI(title="FastAPI async experiment")
WAIT_SECONDS = 0.03


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/blocking")
async def blocking():
    # Cố tình sai để đo tác động của việc chặn event loop.
    time.sleep(WAIT_SECONDS)  # noqa: ASYNC251
    return {"mode": "blocking", "wait_seconds": WAIT_SECONDS}


@app.get("/await")
async def awaiting():
    await asyncio.sleep(WAIT_SECONDS)
    return {"mode": "await", "wait_seconds": WAIT_SECONDS}


@app.get("/thread")
def thread_pool():
    time.sleep(WAIT_SECONDS)
    return {"mode": "thread", "wait_seconds": WAIT_SECONDS}
