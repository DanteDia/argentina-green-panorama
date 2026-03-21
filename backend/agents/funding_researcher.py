"""
Green Panorama Funding Researcher - Perplexity Sonar via OpenRouter

Discovers funding relationships and deeper partner connections using
Perplexity's real-time web search models, accessed through OpenRouter
(same API key, same client pattern).

Models used:
- perplexity/sonar: ~$0.006/query - targeted funding questions
- perplexity/sonar-pro: ~$0.010/query - deep partner discovery (seed nodes only)
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field

from openai import OpenAI

log = logging.getLogger("funding_researcher")

# Reuse OpenRouter client (same as research_agent.py)
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
)

SONAR_MODEL = "perplexity/sonar"
SONAR_PRO_MODEL = "perplexity/sonar-pro"


@dataclass
class FundingSource:
    """A single funding relationship discovered."""
    funder_name: str
    relationship: str = "funder"  # funder, investor, grant_provider, accelerator
    amount: str = ""              # "$2M", "undisclosed", etc.
    round_type: str = ""          # seed, series_a, grant, acceleration
    year: str = ""


@dataclass
class FundingResult:
    """Result of funding research for a company."""
    company_name: str
    funders: list[FundingSource] = field(default_factory=list)
    quien_fondea_str: str = ""    # comma-separated string for the DB field
    error: str = ""
    model_used: str = ""


def research_funding(company_name: str, url: str | None = None) -> FundingResult:
    """Use Perplexity Sonar to find who funds/backs a company.

    Cost: ~$0.006 per query via OpenRouter.
    """
    if not os.getenv("OPENROUTER_API_KEY"):
        return FundingResult(company_name=company_name, error="no_api_key")

    url_context = f" (website: {url})" if url else ""

    prompt = f"""Research the funding, investors, and financial backers of "{company_name}"{url_context},
a company in Argentina's green/environmental/sustainability sector.

Find:
1. Who are the investors, funders, or financial backers?
2. Any accelerator programs they participated in?
3. Government grants or international development funding (BID, CAF, GIZ, etc.)?
4. Corporate sponsors or strategic investors?
5. Funding rounds and amounts if publicly known?

Focus specifically on this company, not generic sector information.
If the company is bootstrapped or self-funded, say so.

Respond ONLY as JSON:
{{
  "funders": [
    {{
      "name": "Funder Name",
      "relationship": "investor|grant_provider|accelerator|corporate_sponsor",
      "amount": "$2M or undisclosed",
      "round_type": "seed|series_a|grant|acceleration",
      "year": "2024"
    }}
  ],
  "summary": "Brief comma-separated list of funder names for display"
}}

If no funding info found, return: {{"funders": [], "summary": "Unknown"}}"""

    try:
        response = client.chat.completions.create(
            model=SONAR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=800,
        )
        content = response.choices[0].message.content or "{}"

        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            funders = []
            for f in data.get("funders", []):
                funders.append(FundingSource(
                    funder_name=f.get("name", ""),
                    relationship=f.get("relationship", "funder"),
                    amount=f.get("amount", ""),
                    round_type=f.get("round_type", ""),
                    year=f.get("year", ""),
                ))

            summary = data.get("summary", "")
            if summary == "Unknown" or not funders:
                summary = ""

            return FundingResult(
                company_name=company_name,
                funders=funders,
                quien_fondea_str=summary,
                model_used=SONAR_MODEL,
            )
    except Exception as e:
        log.error(f"Funding research failed for {company_name}: {e}")
        return FundingResult(company_name=company_name, error=str(e))

    return FundingResult(company_name=company_name, error="parse_failed")


def search_partners_perplexity(company_name: str, url: str | None = None) -> list[dict]:
    """Use Perplexity Sonar Pro to find partners with real web citations.

    Replaces hallucination-prone search_for_partners() for seed nodes.
    Cost: ~$0.010 per query via OpenRouter.
    """
    if not os.getenv("OPENROUTER_API_KEY"):
        return []

    url_context = f" (website: {url})" if url else ""

    prompt = f"""Research "{company_name}"{url_context} in Argentina's green/environmental sector.

List their known partners, allies, portfolio companies, clients, and funders that interact
with Argentina's green/sustainability ecosystem.

CONSTRAINTS:
- Only include organizations operating in or with specific programs in Argentina
- Only include organizations connected to green/environmental/sustainability
- Maximum 10 organizations
- Must be real, verifiable organizations

For each, provide:
- name: organization name
- link: website URL
- relationship: partner, funder, client, portfolio_company, ally

Respond ONLY as a JSON array:
[{{"name": "Company X", "link": "https://...", "relationship": "partner"}}]

If no connections found, return: []"""

    try:
        response = client.chat.completions.create(
            model=SONAR_PRO_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2000,
        )
        content = response.choices[0].message.content or "[]"

        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            results = json.loads(json_match.group())
            for r in results:
                r["_source"] = "perplexity"
            return results[:10]
    except Exception as e:
        log.error(f"Perplexity partner search failed for {company_name}: {e}")
    return []


def extract_funding_from_html(html: str, company_name: str) -> list[dict]:
    """Extract funding/investor mentions from already-scraped HTML.

    Uses existing Gemini Flash Lite client (free).
    """
    from agents.research_agent import client as gemini_client, DEFAULT_MODEL

    prompt = f"""Analyze this HTML from {company_name}'s website and extract ALL funding/investor information.

Look for:
- "Backed by" / "Respaldado por" sections
- Investor/backer logos or names
- "Nuestros inversores" / "Our investors" sections
- Accelerator program badges (Y Combinator, 500 Startups, Wayra, etc.)
- Grant or award mentions
- "Financiado por" / "Funded by" sections

For each funder found, extract:
- name: the organization/fund name
- relationship: investor, grant_provider, accelerator, corporate_sponsor

HTML (truncated):
{html[:6000]}

Respond ONLY as JSON array:
[{{"name": "Funder X", "relationship": "investor"}}]

If no funding info found, return: []"""

    try:
        response = gemini_client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1000,
        )
        content = response.choices[0].message.content or "[]"
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        log.error(f"HTML funding extraction failed for {company_name}: {e}")
    return []


def discover_relationships_deep(company_name: str, url: str | None = None) -> list[dict]:
    """Use Perplexity Sonar to find relationships from non-website sources.

    Specifically targets: newsletters, press releases, LinkedIn announcements,
    social media posts, event reports, conference panels, MoU signings,
    accelerator cohort lists — sources that official websites often miss.

    Cost: ~$0.010 per query via OpenRouter (sonar-pro for better recall).
    """
    if not os.getenv("OPENROUTER_API_KEY"):
        return []

    url_context = f" (website: {url})" if url else ""

    prompt = f"""Search for recent partnerships, collaborations, alliances, and business relationships
involving "{company_name}"{url_context} in Argentina's green/environmental/sustainability sector.

IMPORTANT: Focus on sources OUTSIDE the company's official website:
- Press releases and news articles
- LinkedIn posts and announcements
- Newsletter mentions
- Conference/event panel appearances together with other organizations
- Accelerator cohort announcements
- MoU (Memorandum of Understanding) signings
- Joint project announcements
- Social media announcements (Twitter/X, Instagram business posts)
- Government gazette entries for joint programs
- Industry reports mentioning partnerships

For each relationship found, provide:
- name: the partner/allied organization name
- link: their website URL if available
- relationship: partner, funder, client, portfolio_company, ally, co_investor, project_partner
- evidence: ONE sentence describing where this relationship was announced (e.g. "Announced in LinkedIn post March 2025", "Listed in BYMA accelerator cohort 2024")

CONSTRAINTS:
- Only real, verifiable relationships with evidence
- Only organizations connected to green/environmental/sustainability in Argentina
- Maximum 12 organizations
- Do NOT include relationships already obvious from {company_name}'s official website

Respond ONLY as a JSON array:
[{{"name": "Org X", "link": "https://...", "relationship": "partner", "evidence": "..."}}]

If no relationships found outside official website, return: []"""

    try:
        response = client.chat.completions.create(
            model=SONAR_PRO_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=3000,
        )
        content = response.choices[0].message.content or "[]"

        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            results = json.loads(json_match.group())
            for r in results:
                r["_source"] = "perplexity_deep"
            return results[:12]
    except Exception as e:
        log.error(f"Deep relationship discovery failed for {company_name}: {e}")
    return []
