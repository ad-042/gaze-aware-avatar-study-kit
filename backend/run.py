"""Standalone entry point for the packaged backend (PyInstaller).

When the backend is bundled into a standalone executable via PyInstaller,
this script replaces the ``python -m uvicorn app.main:app`` invocation.
Host and port are read from ``settings`` (which honours env vars and an
optional ``.env`` file in the working directory).
"""

import uvicorn

from app.main import app
from app.settings import settings


def main() -> None:
    uvicorn.run(app, host=settings.app_host, port=settings.app_port)


if __name__ == "__main__":
    main()
