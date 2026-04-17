"""
Outbound Writer — LLM-powered message generator

Given an attendee company (the user searching), a sponsor match they want
to reach, and an optional specific BD person, generate three short outbound
variants tuned to each channel:

    - x_dm:          <=280 chars, casual, opens with a hook
    - linkedin_note: <=300 chars, professional, refers to the event
    - email:         subject + 4-line body with a specific ask

Runs on OpenRouter (same model family as the rest of the pipeline).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field

from openai import OpenAI

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY", ""),
        )
    return _client


OUTBOUND_MODEL = os.getenv("OUTBOUND_MODEL", "google/gemini-2.0-flash-001")


@dataclass
class OutboundContext:
    attendee_company: str
    attendee_summary: str
    sponsor_company: str
    sponsor_summary: str
    synergy_reasoning: str
    event_name: str = "BlockchainRio 2026"
    bd_person_name: str | None = None
    bd_person_title: str | None = None


@dataclass
class OutboundMessages:
    x_dm: str = ""
    linkedin_note: str = ""
    email_subject: str = ""
    email_body: str = ""
    warnings: list[str] = field(default_factory=list)


_JSON_BLOCK = re.compile(r"```(?:json)?\s*|\s*```", re.IGNORECASE)


def _extract_json(content: str) -> dict | None:
    stripped = _JSON_BLOCK.sub("", content).strip()
    start = stripped.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(stripped)):
        ch = stripped[i]
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(stripped[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _build_prompt(ctx: OutboundContext) -> str:
    target = (
        f"{ctx.bd_person_name} ({ctx.bd_person_title})"
        if ctx.bd_person_name
        else f"someone on the BD team at {ctx.sponsor_company}"
    )
    return f"""You are drafting outbound messages for a founder attending {ctx.event_name}.

ATTENDEE (who is sending): {ctx.attendee_company}
{ctx.attendee_summary}

TARGET (who they are messaging): {target} at {ctx.sponsor_company}
About the target company: {ctx.sponsor_summary}

WHY THIS FIT MATTERS:
{ctx.synergy_reasoning}

Write THREE message variants for the attendee to send. Keep them specific,
concrete, and low-pressure. Reference the event by name. Do NOT use hype
words ("revolutionary", "game-changing"). Do NOT use em-dashes.

Return ONLY a JSON object, nothing else, with this exact shape:
{{
  "x_dm": "<<=280 chars, casual, one concrete hook>>",
  "linkedin_note": "<<=300 chars, professional, mentions {ctx.event_name}>>",
  "email_subject": "<<short, under 60 chars, no clickbait>>",
  "email_body": "<<4 lines max, plain text, ends with a single specific ask>>"
}}"""


def generate_messages(ctx: OutboundContext) -> OutboundMessages:
    """Call OpenRouter and return three outbound message variants."""
    client = _get_client()
    try:
        resp = client.chat.completions.create(
            model=OUTBOUND_MODEL,
            messages=[{"role": "user", "content": _build_prompt(ctx)}],
            temperature=0.6,
            max_tokens=600,
        )
        content = resp.choices[0].message.content or ""
    except Exception as e:
        return OutboundMessages(warnings=[f"llm_error: {type(e).__name__}: {e}"])

    data = _extract_json(content)
    if not data:
        return OutboundMessages(warnings=["parse_error: no JSON in LLM response"])

    msgs = OutboundMessages(
        x_dm=str(data.get("x_dm", ""))[:500],
        linkedin_note=str(data.get("linkedin_note", ""))[:500],
        email_subject=str(data.get("email_subject", ""))[:120],
        email_body=str(data.get("email_body", ""))[:1200],
    )

    # Best-effort length sanity — warn but don't truncate aggressively.
    if len(msgs.x_dm) > 280:
        msgs.warnings.append("x_dm_over_280")
    if len(msgs.linkedin_note) > 300:
        msgs.warnings.append("linkedin_note_over_300")

    return msgs


def as_dict(msgs: OutboundMessages) -> dict:
    return asdict(msgs)
