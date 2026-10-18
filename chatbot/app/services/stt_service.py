"""Speech-to-Text Service using the OpenAI Whisper API.

Provides audio transcription via OpenAI's audio/transcriptions endpoint.
"""

import logging
from pathlib import Path
from typing import Optional

import requests

from app.config import AppConfig

logger = logging.getLogger(__name__)


class STTService:
    """Speech-to-Text transcription service using OpenAI Whisper.

    Transcribes audio files to text using OpenAI's Whisper API.
    """

    def __init__(self) -> None:
        """Initialize the STT service with OpenAI configuration."""
        self.config = AppConfig

        # OpenAI Whisper API endpoint
        self._endpoint = "https://api.openai.com/v1/audio/transcriptions"
        self._headers = {
            "Authorization": f"Bearer {self.config.OPENAI_API_KEY}"
        }

        logger.info("STT Service initialized with OpenAI Whisper: %s",
                    self.config.STT_MODEL)

    def transcribe(self, audio_file_path: str) -> str:
        """Transcribe an audio file to text using OpenAI Whisper.

        Args:
            audio_file_path: Path to the audio file.

        Returns:
            Transcribed text string, empty on failure.
        """
        if not self.config.OPENAI_API_KEY:
            logger.error("OPENAI_API_KEY not set, cannot transcribe")
            return ""

        try:
            audio_path = Path(audio_file_path)
            if not audio_path.exists():
                logger.error("Audio file not found: %s", audio_file_path)
                return ""

            with open(audio_path, "rb") as audio_file:
                files = {"file": (audio_path.name, audio_file, "audio/webm")}
                data = {
                    "model": self.config.STT_MODEL,
                    "response_format": "json",
                }

                response = requests.post(
                    self._endpoint,
                    headers=self._headers,
                    files=files,
                    data=data,
                    timeout=60,
                )

            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "")
                logger.debug("Transcription successful: %.50s...", text)
                return text
            else:
                logger.error("OpenAI STT error %s: %s",
                             response.status_code, response.text[:200])
                return ""

        except requests.exceptions.Timeout:
            logger.error("OpenAI STT request timed out for %s", audio_file_path)
            return ""
        except Exception as exc:
            logger.error("STT transcription failed: %s", exc)
            return ""