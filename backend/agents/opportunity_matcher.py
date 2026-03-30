"""
Green Panorama - Opportunity Matcher Agent

Takes a user's company URL, researches it using Perplexity Sonar via OpenRouter,
fetches all event participants from Supabase, then uses an LLM to score synergies
between the user's company and each participant.

Returns a ranked list of matches with synergy types, scores, and action items.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

log = logging.getLogger("opportunity_matcher")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Reuse OpenRouter client pattern from funding_researcher.py
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
)

SONAR_MODEL = "perplexity/sonar"
LLM_MODEL = "google/gemini-2.0-flash-001"

VALID_SYNERGY_TYPES = [
    "potential_client",
    "potential_partner",
    "investor_match",
    "talent_pipeline",
    "technology_complement",
    "market_expansion",
]


def _extract_json(content: str, array: bool = True):
    """Robustly extract JSON from LLM responses."""
    import re
    content = re.sub(r'```(?:json)?\s*', '', content)
    content = content.strip()

    open_char = '[' if array else '{'
    close_char = ']' if array else '}'

    start = content.find(open_char)
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape_next = False
    for i in range(start, len(content)):
        c = content[i]
        if escape_next:
            escape_next = False
            continue
        if c == '\\' and in_string:
            escape_next = True
            continue
        if c == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == open_char:
            depth += 1
        elif c == close_char:
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(content[start:i + 1])
                except json.JSONDecodeError:
                    break

    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(content, start)
        return obj
    except (json.JSONDecodeError, ValueError):
        pass

    return None


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


@dataclass
class SynergyMatch:
    """A single synergy match between user company and an event participant."""
    node_id: str
    company_name: str
    cluster: str
    synergy_type: str
    score: float
    reasoning: str
    action_items: list[str] = field(default_factory=list)


@dataclass
class MatchResult:
    """Result of opportunity matching for a company."""
    company_name: str
    company_summary: str
    matches: list[SynergyMatch] = field(default_factory=list)
    error: str = ""


def research_company(company_url: str, company_name: str | None = None) -> dict:
    """Use Perplexity Sonar to research a company from its URL.

    Returns a dict with: name, description, sector, products, target_market, stage, etc.
    """
    if not os.getenv("OPENROUTER_API_KEY"):
        return {"error": "no_api_key", "name": company_name or company_url}

    name_hint = f' (company name: "{company_name}")' if company_name else ""

    prompt = f"""Research the company at this URL: {company_url}{name_hint}

Provide a comprehensive profile including:
1. Company name
2. What they do (products/services)
3. Their sector/industry
4. Target market and customers
5. Technology stack or key capabilities
6. Company stage (startup, growth, enterprise)
7. Geographic focus
8. Key partnerships or integrations
9. What they might be looking for (clients, partners, investors, talent)

Respond ONLY as JSON:
{{
  "name": "Company Name",
  "description": "Brief description",
  "sector": "Their main sector",
  "products": ["product1", "product2"],
  "target_market": "Who they sell to",
  "technology": ["tech1", "tech2"],
  "stage": "startup|growth|enterprise",
  "geography": "Where they operate",
  "looking_for": ["clients", "partners"],
  "keywords": ["keyword1", "keyword2"]
}}"""

    try:
        response = client.chat.completions.create(
            model=SONAR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1000,
        )
        content = response.choices[0].message.content or "{}"
        data = _extract_json(content, array=False)
        if data and isinstance(data, dict):
            return data
    except Exception as e:
        log.error(f"Company research failed for {company_url}: {e}")
        return {"error": str(e), "name": company_name or company_url}

    return {"error": "parse_failed", "name": company_name or company_url}


def fetch_event_participants(event_slug: str) -> list[dict]:
    """Fetch all participants for an event with their node data."""
    sb = get_supabase()

    # Get participant node IDs
    resp = sb.table("event_participants") \
        .select("node_id, role, sponsor_tier") \
        .eq("event_slug", event_slug) \
        .execute()

    if not resp.data:
        return []

    node_ids = [p["node_id"] for p in resp.data]
    participant_meta = {p["node_id"]: p for p in resp.data}

    # Fetch node data
    nodes_resp = sb.table("nodes") \
        .select("id, nombre, link, cluster, categoria, descripcion, quien_fondea, aliados_portfolio, clientes") \
        .in_("id", node_ids) \
        .execute()

    if not nodes_resp.data:
        return []

    # Merge node data with participant metadata
    participants = []
    for node in nodes_resp.data:
        meta = participant_meta.get(node["id"], {})
        participants.append({
            **node,
            "role": meta.get("role", ""),
            "sponsor_tier": meta.get("sponsor_tier", ""),
        })

    return participants


def score_synergies(
    company_profile: dict,
    participants: list[dict],
) -> list[SynergyMatch]:
    """Use LLM to score synergies between user company and each participant.

    Sends the company profile + all participants in one call for efficiency.
    """
    if not os.getenv("OPENROUTER_API_KEY"):
        return []

    # Build participant summaries
    participant_summaries = []
    for p in participants:
        summary = {
            "id": p["id"],
            "name": p["nombre"],
            "cluster": p.get("cluster", ""),
            "category": p.get("categoria", ""),
            "description": p.get("descripcion", ""),
            "funding": p.get("quien_fondea", ""),
            "partners": p.get("aliados_portfolio", []),
            "clients": p.get("clientes", []),
        }
        participant_summaries.append(summary)

    prompt = f"""You are an expert business development analyst at a blockchain/crypto conference.

USER'S COMPANY PROFILE:
{json.dumps(company_profile, indent=2)}

EVENT PARTICIPANTS:
{json.dumps(participant_summaries, indent=2)}

For each participant, evaluate the synergy with the user's company. Score each match from 0.0 to 1.0.

SYNERGY TYPES (choose the best fit):
- "potential_client": They could buy the user's product/service
- "potential_partner": Mutual benefit from partnering/integrating
- "investor_match": They invest in companies like the user's (or vice versa)
- "talent_pipeline": They could provide talent or the user could hire from them
- "technology_complement": Their tech complements the user's stack
- "market_expansion": They could help the user enter new markets

RULES:
- Only include matches with score >= 0.3
- Maximum 20 matches
- Sort by score descending
- Be specific in reasoning — mention actual products, services, or capabilities
- Action items should be concrete next steps for the conference

Respond ONLY as a JSON array:
[{{
  "node_id": "uuid",
  "company_name": "Name",
  "cluster": "Their cluster",
  "synergy_type": "potential_client|potential_partner|investor_match|talent_pipeline|technology_complement|market_expansion",
  "score": 0.85,
  "reasoning": "Specific reason why this is a good match",
  "action_items": ["Visit their booth", "Propose integration demo"]
}}]"""

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
        )
        content = response.choices[0].message.content or "[]"
        results = _extract_json(content, array=True)

        if results and isinstance(results, list):
            matches = []
            for r in results:
                if not isinstance(r, dict):
                    continue
                score = float(r.get("score", 0))
                if score < 0.3:
                    continue
                synergy_type = r.get("synergy_type", "potential_partner")
                if synergy_type not in VALID_SYNERGY_TYPES:
                    synergy_type = "potential_partner"
                matches.append(SynergyMatch(
                    node_id=r.get("node_id", ""),
                    company_name=r.get("company_name", ""),
                    cluster=r.get("cluster", ""),
                    synergy_type=synergy_type,
                    score=min(1.0, max(0.0, score)),
                    reasoning=r.get("reasoning", ""),
                    action_items=r.get("action_items", []),
                ))
            # Sort by score descending
            matches.sort(key=lambda m: m.score, reverse=True)
            return matches[:20]
    except Exception as e:
        log.error(f"Synergy scoring failed: {e}")

    return []


def store_synergies(event_slug: str, company_url: str, matches: list[SynergyMatch]):
    """Store synergy results in the synergies table."""
    try:
        sb = get_supabase()
        rows = []
        for m in matches:
            rows.append({
                "event_slug": event_slug,
                "company_url": company_url,
                "node_id": m.node_id,
                "company_name": m.company_name,
                "synergy_type": m.synergy_type,
                "score": m.score,
                "reasoning": m.reasoning,
                "action_items": m.action_items,
            })
        if rows:
            sb.table("synergies").insert(rows).execute()
    except Exception as e:
        log.warning(f"Failed to store synergies: {e}")


def match_opportunities(
    company_url: str,
    event_slug: str,
    company_name: str | None = None,
) -> MatchResult:
    """Main entry point: research company, fetch participants, score synergies.

    Args:
        company_url: URL of the user's company
        event_slug: Event identifier for fetching participants
        company_name: Optional company name hint

    Returns:
        MatchResult with ranked synergy matches
    """
    # Step 1: Research the user's company
    profile = research_company(company_url, company_name)
    if profile.get("error"):
        return MatchResult(
            company_name=company_name or company_url,
            company_summary="",
            error=f"Could not research company: {profile['error']}",
        )

    resolved_name = profile.get("name", company_name or company_url)

    # Step 2: Fetch event participants
    participants = fetch_event_participants(event_slug)
    if not participants:
        return MatchResult(
            company_name=resolved_name,
            company_summary=profile.get("description", ""),
            error="No participants found for this event",
        )

    # Step 3: Score synergies
    matches = score_synergies(profile, participants)

    # Step 4: Store results
    store_synergies(event_slug, company_url, matches)

    return MatchResult(
        company_name=resolved_name,
        company_summary=profile.get("description", ""),
        matches=matches,
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python opportunity_matcher.py <company_url> <event_slug> [company_name]")
        sys.exit(1)

    url = sys.argv[1]
    slug = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else None

    result = match_opportunities(url, slug, name)
    print(json.dumps({
        "company_name": result.company_name,
        "company_summary": result.company_summary,
        "error": result.error,
        "matches": [
            {
                "node_id": m.node_id,
                "company_name": m.company_name,
                "cluster": m.cluster,
                "synergy_type": m.synergy_type,
                "score": m.score,
                "reasoning": m.reasoning,
                "action_items": m.action_items,
            }
            for m in result.matches
        ],
    }, indent=2))
