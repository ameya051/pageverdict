from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any

from app.llm import generate_json
from app.models.schemas import AuditSection, Issue

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    category: str
    name: str

    @abstractmethod
    def _build_prompt(self, **kwargs: Any) -> tuple[str, str | list]:
        """Return (system_instruction, contents) for the Gemini call."""
        ...

    async def analyze(self, **kwargs: Any) -> AuditSection:
        last_exc: Exception | None = None

        for attempt in range(3):
            try:
                system_instruction, contents = self._build_prompt(**kwargs)
                raw = await generate_json(
                    contents=contents,
                    system_instruction=system_instruction,
                    temperature=0.4,
                )
                data = json.loads(raw or "{}")
                return self._parse_result(data)
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "%s attempt %d/3 failed: %s",
                    self.__class__.__name__,
                    attempt + 1,
                    exc,
                )

        logger.error("%s exhausted retries: %s", self.__class__.__name__, last_exc)
        return self._fallback_result()

    def _parse_result(self, data: dict) -> AuditSection:
        score = max(0.0, min(10.0, float(data.get("score", 5.0))))

        issues: list[Issue] = []
        for i, item in enumerate(data.get("issues", [])[:5]):
            issues.append(
                Issue(
                    id=item.get("id", f"{self.category}-issue-{i}"),
                    title=item.get("title", "Issue"),
                    description=item.get("description", ""),
                    severity=item.get("severity", "warning"),
                    impact=item.get("impact", ""),
                    recommendation=item.get("recommendation", ""),
                )
            )

        return AuditSection(
            category=self.category,
            name=self.name,
            score=score,
            issues=issues,
            strengths=data.get("strengths", [])[:3],
            summary=data.get("summary", ""),
        )

    def _fallback_result(self) -> AuditSection:
        return AuditSection(
            category=self.category,
            name=self.name,
            score=5.0,
            issues=[],
            strengths=[],
            summary="Analysis unavailable.",
        )
