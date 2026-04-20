from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    data_dir: str = str(_PROJECT_ROOT / "data")
    log_dir: str = str(_PROJECT_ROOT / "data" / "logs")
    study_dir: str = str(_PROJECT_ROOT / "study")

    log_mode: Literal["default", "research"] = "default"
    research_gaze_sample_hz: int = 90

    openai_api_key: str = ""
    openai_realtime_enabled: bool = False
    openai_realtime_model: str = "gpt-realtime-mini"
    openai_realtime_voice: str = "alloy"

    tobii_enabled: bool = False
    tobiistream_path: str = ""
    tobii_zmq_endpoint: str = "tcp://127.0.0.1:5556"
    tobii_screen_width: int = 0
    tobii_screen_height: int = 0

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def effective_capture(self) -> dict[str, bool]:
        """Derive what this backend instance actually captures.

        Most categories require research log_mode.  Some additionally
        need a specific integration (Tobii for raw gaze, OpenAI Realtime
        for transcripts/speaking states).  The result is exposed via
        /api/runtime and drives the frontend consent disclosure.
        """
        research = self.log_mode == "research"
        realtime = self.openai_realtime_enabled
        return {
            "session_metadata": True,
            "questionnaire_answers": research,
            "form_answers": research,
            "transcripts": research and realtime,
            "gaze_samples": research,
            "gaze_tobii_raw": research and self.tobii_enabled,
            "speaking_states": research and realtime,
            "operator_notes_persisted": research,
            "audio_sent_to_openai": realtime,
        }


settings = Settings()
