import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        # Uvicorn's asyncio loop factory picks SelectorEventLoop when reload=True
        # on Windows, which breaks Playwright (no subprocess support).
        # "none" skips the factory and uses Python's default ProactorEventLoop.
        loop="none",
    )
