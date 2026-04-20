"""Thread-safe in-memory store for the latest gaze sample.

The Tobii adapter writes to this store and the gaze route reads from it.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass


@dataclass
class GazeSample:
    x: float = 0.0
    y: float = 0.0
    timestamp: float = 0.0
    valid: bool = False


class GazeStore:
    """Single-writer / multi-reader store for the current gaze point."""

    def __init__(self, *, stale_timeout: float = 0.15) -> None:
        self._lock = threading.Lock()
        self._sample = GazeSample()
        self._stale_timeout = stale_timeout
        self._version = 0

    def update(self, x: float, y: float) -> None:
        """Called by the Tobii adapter when a new sample arrives."""
        with self._lock:
            self._sample = GazeSample(x=x, y=y, timestamp=time.time(), valid=True)
            self._version += 1

    def latest(self) -> dict:
        """Return the most recent sample, marking it invalid if stale."""
        with self._lock:
            s = self._sample
        if not s.valid or (time.time() - s.timestamp > self._stale_timeout):
            return {"x": None, "y": None, "valid": False}
        return {"x": s.x, "y": s.y, "valid": True}

    @property
    def version(self) -> int:
        """Monotonic counter incremented on each update()."""
        with self._lock:
            return self._version

    def snapshot(self) -> tuple[int, dict]:
        """Atomic read of version + current sample for WS streaming.

        All primitive fields are copied under the lock.  The returned dict
        is computed from those copies so no mutable state escapes the
        critical section.
        """
        with self._lock:
            v = self._version
            x, y, ts, valid = (
                self._sample.x,
                self._sample.y,
                self._sample.timestamp,
                self._sample.valid,
            )
            stale_timeout = self._stale_timeout
        if not valid or (time.time() - ts > stale_timeout):
            return v, {"x": None, "y": None, "valid": False}
        return v, {"x": x, "y": y, "valid": True}

    def is_active(self) -> bool:
        """Return True if fresh gaze data is being received."""
        with self._lock:
            s = self._sample
        return s.valid and (time.time() - s.timestamp <= self._stale_timeout)


# Module-level singleton — imported by adapter and route.
gaze_store = GazeStore()
