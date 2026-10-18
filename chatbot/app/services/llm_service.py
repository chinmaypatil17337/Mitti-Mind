"""LLM Service using the OpenAI SDK for prompt-cached agricultural advisory.

Uses the OpenAI Python SDK directly (not LangChain) to enable
automatic prompt caching with cache hit rate tracking.

Prompt caching is automatic on OpenAI for prompts over ~1024 tokens.
Static prefixes (system prompt + history) are cached across requests.
Cached tokens are billed at a discount and reported in usage.prompt_tokens_details.
"""

import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

import openai

from app.config import AppConfig
from app.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


def strip_markdown(text: str) -> str:
    """Remove markdown formatting from LLM output.

    Strips bold (**), italic (*), headers (#), backticks, etc.
    This is a safety net in case the model ignores the prompt instruction.
    """
    if not text:
        return text

    # Remove bold: **text** → text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Remove italic: *text* → text
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
    # Remove underscores: _text_ → text
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text)
    # Remove headers: ### text → text
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove backticks: `text` → text
    text = re.sub(r'`([^`\n]+)`', r'\1', text)
    # Remove triple backtick blocks
    text = re.sub(r'```[\s\S]*?```', '', text)

    return text.strip()


@dataclass
class LLMResult:
    """Response wrapper including cache metrics."""
    text: str
    prompt_tokens: int = 0
    cached_tokens: int = 0
    completion_tokens: int = 0

    @property
    def cache_hit_rate(self) -> float:
        """Percentage of prompt tokens served from cache."""
        if self.prompt_tokens == 0:
            return 0.0
        return (self.cached_tokens / self.prompt_tokens) * 100


class LLMService:
    """Service for LLM interaction via the OpenAI SDK with prompt caching.

    Prompt caching works automatically when the static prefix
    (system prompt + conversation history) is consistent across requests.
    Only the new user query changes, maximizing cache hits.
    """

    def __init__(self) -> None:
        """Initialize the LLM service."""
        self.config = AppConfig
        self.prompt_manager = PromptManager()
        self._client = self._create_client()
        logger.info("LLM Service initialized (model: %s)", self.config.LLM_MODEL)

    def _create_client(self) -> Optional[openai.OpenAI]:
        """Create the OpenAI client."""
        api_key = self.config.OPENAI_API_KEY
        if not api_key:
            logger.warning("OPENAI_API_KEY not set. LLM unavailable.")
            return None
        return openai.OpenAI(api_key=api_key)

    def _create_chat_completion(self, *, model: str, messages: list, max_tokens: int):
        """Call chat.completions.create, tolerating models that reject a
        custom temperature.

        Some models (OpenAI's reasoning models, e.g. the gpt-5.x "nano"/
        "mini" family and o-series) only support the default temperature=1
        and return HTTP 400 if a different value is sent. Rather than
        hardcoding a list of which models allow it (which goes stale as
        OpenAI ships new ones), try with our configured temperature first
        and silently retry without it if that's the specific rejection.
        """
        try:
            return self._client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=self.config.LLM_TEMPERATURE,
                max_completion_tokens=max_tokens,
            )
        except openai.BadRequestError as exc:
            if exc.param == "temperature":
                logger.warning(
                    "Model %s does not support a custom temperature; retrying with the model default.",
                    model,
                )
                return self._client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_completion_tokens=max_tokens,
                )
            raise

    def generate(
        self,
        user_query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        session_id: Optional[str] = None,
        language: Optional[str] = None,
        extra_context: Optional[Dict] = None,
    ) -> LLMResult:
        """Generate a response with cache hit tracking.

        Args:
            user_query: The farmer's input message.
            conversation_history: Prior messages from memory.
            session_id: Session ID for logging.
            language: Selected app language display name (e.g. "Hindi"),
                so the response follows the UI language rather than just
                mirroring whatever language the message happens to be in.
            extra_context: Optional dict with "weather" / "recent_plant_analysis",
                sourced from the dashboard (Weather card, Plant Status card),
                so the bot can reference them without the farmer repeating them.

        Returns:
            LLMResult with text and cache metrics.
        """
        if self._client is None:
            return LLMResult(text="LLM not configured. Set OPENAI_API_KEY in .env.")

        try:
            messages = self.prompt_manager.build_messages(
                user_query=user_query,
                conversation_history=conversation_history,
                language=language,
                extra_context=extra_context,
            )

            logger.debug("LLM call [session: %s], messages=%d",
                         session_id, len(messages))

            response = self._create_chat_completion(
                model=self.config.LLM_MODEL,
                messages=messages,
                max_tokens=self.config.LLM_MAX_TOKENS,
            )

            # Extract cache metrics from usage
            usage = response.usage
            cached_tokens = 0
            prompt_tokens = getattr(usage, 'prompt_tokens', 0)

            details = getattr(usage, 'prompt_tokens_details', None)
            if details and isinstance(details, dict):
                cached_tokens = details.get('cached_tokens', 0)
            elif details:
                cached_tokens = getattr(details, 'cached_tokens', 0)

            result = LLMResult(
                text=strip_markdown(response.choices[0].message.content.strip()),
                prompt_tokens=prompt_tokens,
                cached_tokens=cached_tokens,
                completion_tokens=getattr(usage, 'completion_tokens', 0),
            )

            logger.info(
                "LLM response [session: %s] — "
                "prompt: %d tokens, cached: %d (%.0f%% hit), "
                "completion: %d tokens",
                session_id,
                result.prompt_tokens,
                result.cached_tokens,
                result.cache_hit_rate,
                result.completion_tokens,
            )

            return result

        except Exception as exc:
            logger.error("LLM generation failed [session: %s]: %s",
                         session_id, exc)
            return LLMResult(
                text="I apologize, but I'm experiencing a temporary issue. "
                     "Please try again in a moment."
            )

    @property
    def client(self):
        """Access the underlying OpenAI client."""
        return self._client

    def generate_with_image(
        self,
        user_query: str,
        image_base64: str,
        image_mime: str = "image/jpeg",
        session_id: Optional[str] = None,
        language: Optional[str] = None,
        extra_context: Optional[Dict] = None,
    ) -> LLMResult:
        """Generate a response analyzing an image with the vision model.

        Uses the configured LLM_VISION_MODEL (gpt-4o-mini by default, which
        supports multimodal input). The image is passed as a base64 data URL.

        Args:
            user_query: The farmer's question about the image.
            image_base64: Base64 encoded image data.
            image_mime: MIME type (image/jpeg, image/png, etc).
            session_id: Session ID for logging.
            language: Selected app language display name (e.g. "Hindi").
            extra_context: Optional dict with "weather" / "recent_plant_analysis".

        Returns:
            LLMResult with text and cache metrics.
        """
        if self._client is None:
            return LLMResult(text="LLM not configured. Set OPENAI_API_KEY in .env.")

        try:
            system_prompt = self.prompt_manager.get_system_prompt()

            messages = [{"role": "system", "content": system_prompt}]

            context_block = self.prompt_manager.build_context_block(language, extra_context)
            if context_block:
                messages.append({"role": "system", "content": context_block})

            messages.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_query},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{image_mime};base64,{image_base64}"
                            },
                        },
                    ],
                }
            )

            logger.debug("Vision LLM call [session: %s]", session_id)

            response = self._create_chat_completion(
                model=self.config.LLM_VISION_MODEL,
                messages=messages,
                max_tokens=self.config.LLM_MAX_TOKENS,
            )

            usage = response.usage
            cached_tokens = 0
            prompt_tokens = getattr(usage, 'prompt_tokens', 0)

            details = getattr(usage, 'prompt_tokens_details', None)
            if details and isinstance(details, dict):
                cached_tokens = details.get('cached_tokens', 0)
            elif details:
                cached_tokens = getattr(details, 'cached_tokens', 0)

            result = LLMResult(
                text=strip_markdown(response.choices[0].message.content.strip()),
                prompt_tokens=prompt_tokens,
                cached_tokens=cached_tokens,
                completion_tokens=getattr(usage, 'completion_tokens', 0),
            )

            logger.info(
                "Vision response [session: %s] — prompt: %d, cached: %d (%.0f%%)",
                session_id, result.prompt_tokens,
                result.cached_tokens, result.cache_hit_rate,
            )

            return result

        except Exception as exc:
            logger.error("Vision LLM failed [session: %s]: %s", session_id, exc)
            return LLMResult(
                text="I could not analyze the image. Please try again."
            )