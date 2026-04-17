"""
BD Contact Finder — Scrapling PoC

Given a target company name, find candidate business-development humans on
LinkedIn and X without touching LinkedIn's login wall or hitting X's authed
APIs. Strategy: run search-engine dork queries through a stealth fetcher
(Scrapling if installed, httpx fallback otherwise) and parse public result
snippets.

This is a proof-of-concept — run it standalone via:

    python -m backend.agents.bd_contact_finder "Stellar"

to see hit rate against a real BlockchainRio sponsor before wiring it into
the opportunity-matching pipeline.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.parse
from dataclasses import asdict, dataclass, field
from html import unescape
from typing import Literal

BD_TITLES = [
    "Business Development",
    "BD Lead",
    "Head of BD",
    "Head of Partnerships",
    "Partnerships",
    "Partnerships Lead",
    "Growth Lead",
    "Head of Growth",
    "Strategic Partnerships",
    "Ecosystem Lead",
]

DDG_HTML = "https://html.duckduckgo.com/html/"
SERPER_API_URL = "https://google.serper.dev/search"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


@dataclass
class BDPerson:
    name: str
    title: str = ""
    platform: Literal["linkedin", "x"] = "linkedin"
    profile_url: str = ""
    snippet: str = ""
    confidence: float = 0.5


@dataclass
class BDSearchResult:
    company: str
    query_linkedin: str = ""
    query_x: str = ""
    people: list[BDPerson] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _titles_disjunction(titles: list[str]) -> str:
    return " OR ".join(f'"{t}"' for t in titles)


def build_linkedin_query(company_name: str) -> str:
    return f'site:linkedin.com/in ({_titles_disjunction(BD_TITLES)}) "{company_name}"'


def build_x_query(company_name: str) -> str:
    return (
        f'(site:x.com OR site:twitter.com) -inurl:status -inurl:search '
        f'({_titles_disjunction(BD_TITLES[:5])}) "{company_name}"'
    )


async def _fetch_html(url: str, params: dict[str, str] | None = None) -> str | None:
    """Fetch a page with Scrapling's stealth fetcher if available, else httpx."""
    full_url = url
    if params:
        full_url = f"{url}?{urllib.parse.urlencode(params)}"

    try:
        from scrapling.fetchers import StealthyFetcher  # type: ignore

        def _fetch() -> str | None:
            page = StealthyFetcher.fetch(full_url, headless=True, network_idle=True)
            return getattr(page, "html_content", None) or getattr(page, "text", None)

        return await asyncio.to_thread(_fetch)
    except ImportError:
        pass

    import httpx

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        ) as client:
            resp = await client.get(full_url)
            if resp.status_code == 200:
                return resp.text
    except Exception:
        return None
    return None


_DDG_RESULT_BLOCK = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>'
    r'.*?class="result__snippet"[^>]*>(.*?)</a>',
    re.DOTALL,
)

_TAG = re.compile(r"<[^>]+>")


def _strip_tags(s: str) -> str:
    return unescape(_TAG.sub("", s)).strip()


def _clean_ddg_href(href: str) -> str:
    """DuckDuckGo wraps outbound links in /l/?uddg=<encoded-url>."""
    if href.startswith("//duckduckgo.com/l/?") or href.startswith("/l/?"):
        parsed = urllib.parse.urlparse(href if "://" in href else f"https:{href}")
        qs = urllib.parse.parse_qs(parsed.query)
        target = qs.get("uddg", [""])[0]
        if target:
            return urllib.parse.unquote(target)
    return href


def parse_ddg_results(html: str) -> list[tuple[str, str, str]]:
    """Return list of (url, title, snippet) tuples from a DDG HTML SERP."""
    out: list[tuple[str, str, str]] = []
    for href, title_html, snippet_html in _DDG_RESULT_BLOCK.findall(html):
        url = _clean_ddg_href(href)
        title = _strip_tags(title_html)
        snippet = _strip_tags(snippet_html)
        if url and title:
            out.append((url, title, snippet))
    return out


_LINKEDIN_TITLE = re.compile(
    r"^(?P<name>[^|\-–—•]+?)\s*[\-–—|•]\s*(?P<title>.+?)(?:\s*[\-–—|•]\s*.+)?$"
)


def parse_linkedin_result(
    url: str, title: str, snippet: str, company: str
) -> BDPerson | None:
    if "linkedin.com/in/" not in url:
        return None

    # Drop the trailing " | LinkedIn" / " - LinkedIn" tail if present.
    cleaned = re.sub(r"\s*[\-–—|•]\s*LinkedIn\s*$", "", title, flags=re.IGNORECASE)
    m = _LINKEDIN_TITLE.match(cleaned)
    if not m:
        return None

    name = m.group("name").strip()
    title_part = m.group("title").strip()

    # Confidence gets a bump when the company name is in the title/snippet
    # and a BD keyword shows up too.
    text = f"{title_part} {snippet}".lower()
    has_company = company.lower() in text
    has_bd = any(t.lower() in text for t in BD_TITLES)
    confidence = 0.4 + (0.3 if has_company else 0.0) + (0.2 if has_bd else 0.0)

    return BDPerson(
        name=name,
        title=title_part[:120],
        platform="linkedin",
        profile_url=url.split("?")[0],
        snippet=snippet[:240],
        confidence=round(confidence, 2),
    )


_X_HANDLE = re.compile(r"(?:x\.com|twitter\.com)/(?!home|search|intent|i/)([A-Za-z0-9_]{1,15})")


def parse_x_result(url: str, title: str, snippet: str, company: str) -> BDPerson | None:
    m = _X_HANDLE.search(url)
    if not m:
        return None
    handle = m.group(1)

    # Strip " (@handle) / X" / " / Twitter" boilerplate.
    cleaned = re.sub(r"\s*\(@[^)]+\)\s*[/|]\s*(X|Twitter).*$", "", title).strip()
    # Title on X profile pages is often just the display name.
    name = cleaned or handle

    text = f"{title} {snippet}".lower()
    has_company = company.lower() in text
    has_bd = any(t.lower() in text for t in BD_TITLES)
    if not has_bd:
        # X search catches far more noise than LinkedIn — require a BD hit.
        return None
    confidence = 0.35 + (0.25 if has_company else 0.0) + (0.2 if has_bd else 0.0)

    return BDPerson(
        name=name,
        title=snippet[:120],
        platform="x",
        profile_url=f"https://x.com/{handle}",
        snippet=snippet[:240],
        confidence=round(confidence, 2),
    )


def _dedupe(people: list[BDPerson]) -> list[BDPerson]:
    seen: dict[str, BDPerson] = {}
    for p in people:
        key = p.profile_url.lower()
        existing = seen.get(key)
        if existing is None or p.confidence > existing.confidence:
            seen[key] = p
    return sorted(seen.values(), key=lambda x: x.confidence, reverse=True)


# ---------------------------------------------------------------------------
# Perplexity-powered BD search (primary, more reliable than DDG dorks)
# ---------------------------------------------------------------------------

SONAR_MODEL = "perplexity/sonar"

_PERPLEXITY_JSON_BLOCK = re.compile(r"```(?:json)?\s*|\s*```", re.IGNORECASE)


async def _search_bd_perplexity(company_name: str, max_results: int = 5) -> list[BDPerson]:
    """Use Perplexity Sonar to find BD/partnerships people at a company.

    Returns structured results with LinkedIn/X URLs when available.
    Cost: ~$0.006 per query.
    """
    import os

    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        return []

    from openai import OpenAI

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)

    prompt = f"""Find people at "{company_name}" who work in Business Development, Partnerships, or Growth.

Search for their LinkedIn profiles and X/Twitter handles. Look for titles like:
Head of BD, Head of Partnerships, Business Development Lead, Growth Lead,
Strategic Partnerships, Ecosystem Lead, BD Manager.

Return ONLY a JSON array. For each person found:
- name: full name
- title: their job title at {company_name}
- linkedin_url: LinkedIn profile URL (if found)
- x_url: X/Twitter profile URL (if found)

Maximum {max_results} people. Only include people you can verify actually work at {company_name}.
If no BD people found, return [].

JSON array:"""

    try:
        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=SONAR_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1500,
            )
        )
        content = response.choices[0].message.content or "[]"
        content = _PERPLEXITY_JSON_BLOCK.sub("", content).strip()

        # Extract JSON array
        start = content.find("[")
        if start == -1:
            return []
        end = content.rfind("]")
        if end <= start:
            return []

        import json as _json

        items = _json.loads(content[start : end + 1])
        if not isinstance(items, list):
            return []

        people: list[BDPerson] = []
        for item in items[:max_results]:
            if not isinstance(item, dict) or not item.get("name"):
                continue

            name = str(item["name"]).strip()
            title = str(item.get("title", "")).strip()
            linkedin = str(item.get("linkedin_url", "")).strip()
            x_url = str(item.get("x_url", "")).strip()

            # Prefer LinkedIn if available
            if linkedin and "linkedin.com/in/" in linkedin:
                people.append(BDPerson(
                    name=name,
                    title=title,
                    platform="linkedin",
                    profile_url=linkedin.split("?")[0],
                    confidence=0.75,
                ))

            # Also add X if available
            if x_url and ("x.com/" in x_url or "twitter.com/" in x_url):
                people.append(BDPerson(
                    name=name,
                    title=title,
                    platform="x",
                    profile_url=x_url.split("?")[0],
                    confidence=0.7,
                ))

            # If neither URL, still include with lower confidence
            if not linkedin and not x_url:
                people.append(BDPerson(
                    name=name,
                    title=title,
                    platform="linkedin",
                    profile_url=f"https://www.linkedin.com/search/results/people/?keywords={urllib.parse.quote(f'{name} {company_name}')}",
                    confidence=0.4,
                ))

        return people

    except Exception:
        return []


# ---------------------------------------------------------------------------
# Serper.dev — Google search API (no CAPTCHAs, free tier: 2500 searches)
# ---------------------------------------------------------------------------


async def _search_serper(query: str, num: int = 10) -> list[tuple[str, str, str]]:
    """Search Google via Serper.dev API. Returns list of (url, title, snippet).

    Requires SERPER_API_KEY env var. Free tier: 2,500 searches.
    Sign up at https://serper.dev — no credit card required.
    """
    import os

    api_key = os.getenv("SERPER_API_KEY", "")
    if not api_key:
        return []

    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                SERPER_API_URL,
                json={"q": query, "num": num},
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            results = []
            for item in data.get("organic", []):
                url = item.get("link", "")
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                if url:
                    results.append((url, title, snippet))
            return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Main entry point — Serper (Google API) primary, Perplexity + DDG fallback
# ---------------------------------------------------------------------------


async def find_bd_contacts(
    company_name: str,
    max_per_platform: int = 5,
) -> BDSearchResult:
    """Find BD-flavored profiles for `company_name`.

    Strategy:
    1. Serper.dev (primary) — Google search API, no CAPTCHAs, structured results
    2. Perplexity Sonar (secondary) — when Serper key not set
    3. DDG dorks (last resort) — free but rate-limited from VPS IPs
    """
    result = BDSearchResult(
        company=company_name,
        query_linkedin=build_linkedin_query(company_name),
        query_x=build_x_query(company_name),
    )

    people: list[BDPerson] = []
    import os

    # Strategy 1: Serper.dev Google API (best option — structured, no CAPTCHAs)
    if os.getenv("SERPER_API_KEY"):
        linkedin_results, x_results = await asyncio.gather(
            _search_serper(result.query_linkedin, num=10),
            _search_serper(result.query_x, num=10),
        )

        for url, title, snippet in linkedin_results:
            person = parse_linkedin_result(url, title, snippet, company_name)
            if person:
                people.append(person)

        for url, title, snippet in x_results:
            person = parse_x_result(url, title, snippet, company_name)
            if person:
                people.append(person)

        if people:
            result.people = _dedupe(people)[: max_per_platform * 2]
            return result
        result.errors.append("serper: no BD profiles found in Google results")

    # Strategy 2: Perplexity Sonar
    perplexity_people = await _search_bd_perplexity(company_name, max_results=max_per_platform)
    if perplexity_people:
        result.people = _dedupe(perplexity_people)[: max_per_platform * 2]
        return result
    if not os.getenv("SERPER_API_KEY"):
        result.errors.append("perplexity: no results")

    # Strategy 3: DDG dorks (last resort, likely rate-limited on VPS)
    linkedin_html, x_html = await asyncio.gather(
        _fetch_html(DDG_HTML, {"q": result.query_linkedin}),
        _fetch_html(DDG_HTML, {"q": result.query_x}),
    )

    if linkedin_html:
        for url, title, snippet in parse_ddg_results(linkedin_html)[: max_per_platform * 3]:
            person = parse_linkedin_result(url, title, snippet, company_name)
            if person:
                people.append(person)

    if x_html:
        for url, title, snippet in parse_ddg_results(x_html)[: max_per_platform * 3]:
            person = parse_x_result(url, title, snippet, company_name)
            if person:
                people.append(person)

    if not people:
        result.errors.append("all_sources: no BD contacts found")

    result.people = _dedupe(people)[: max_per_platform * 2]
    return result


async def _cli(company: str) -> None:
    result = await find_bd_contacts(company)
    print(
        json.dumps(
            {
                "company": result.company,
                "query_linkedin": result.query_linkedin,
                "query_x": result.query_x,
                "errors": result.errors,
                "people": [asdict(p) for p in result.people],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python -m backend.agents.bd_contact_finder "Company Name"')
        sys.exit(1)
    asyncio.run(_cli(" ".join(sys.argv[1:])))
