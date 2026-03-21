"""
Green Panorama Research Agent - Spider Pattern

This agent discovers new companies in Argentina's green ecosystem by:
1. Starting from known seed companies
2. Scraping their websites for partner/aliado sections
3. Following links to discover new companies
4. Extracting structured node data
5. Determining relationships
6. Writing to Supabase

Uses OpenRouter API with cheap/free models for cost-effective 24/7 operation.
"""

import json
import os
import re
from dataclasses import dataclass, field

import httpx
from openai import OpenAI

# OpenRouter client (OpenAI-compatible API)
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
)

# Default model - cheap and capable
DEFAULT_MODEL = "google/gemini-2.0-flash-001"
VISION_MODEL = "google/gemini-2.0-flash-001"  # supports vision


@dataclass
class DiscoveredNode:
    nombre: str
    link: str | None = None
    cluster: str = ""
    categoria: str = ""
    quien_fondea: str = ""
    aliados_portfolio: list[str] = field(default_factory=list)
    clientes: list[str] = field(default_factory=list)
    descripcion: str = ""
    relationship_to_source: str = ""  # how it relates to the source company
    relationship_type: str = "partners_with"  # funds, partners_with, client_of


@dataclass
class ResearchResult:
    source_company: str
    discovered_nodes: list[DiscoveredNode] = field(default_factory=list)
    raw_partners_found: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


async def fetch_webpage(url: str) -> str | None:
    """Fetch a webpage and return its text content."""
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client_http:
            response = await client_http.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Green Panorama Research Bot"
            })
            if response.status_code == 200:
                return response.text[:15000]  # limit to 15k chars
    except Exception as e:
        return None
    return None


def extract_partners_from_html(html: str, company_name: str) -> list[dict]:
    """Use LLM to extract partner/aliado information from HTML content."""
    prompt = f"""Analyze this HTML content from {company_name}'s website and extract ALL partners,
allies, portfolio companies, clients, funders, or related organizations mentioned.

Look for:
- Partner/Aliado/Socios sections
- Portfolio pages
- "Backed by" / "Supported by" sections
- Client logos or mentions
- Funding/investor mentions
- Footer partner logos
- "Trabajan con nosotros" sections

For each organization found, extract:
- name: the organization name
- link: URL if available (from href attributes)
- relationship: how they relate (partner, funder, client, portfolio_company)

HTML content (truncated):
{html[:8000]}

Respond ONLY as a JSON array:
[{{"name": "Company X", "link": "https://...", "relationship": "partner"}}]

If no partners found, return empty array: []
"""

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
        )
        content = response.choices[0].message.content or "[]"
        # Extract JSON from response
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"Error extracting partners: {e}")
    return []


def research_company(name: str, url: str | None) -> DiscoveredNode | None:
    """Research a discovered company and extract structured data."""
    prompt = f"""Research this company/organization and provide structured information.
Company name: {name}
Website: {url or 'unknown'}

Determine:
1. What cluster does it belong to? Choose from: Empresa Privada, ONG, Fondo Verde, Aceleradora, Organismo Internacional, Consultora, Startup, Government
2. What category/subcategory? (e.g., energía renovable, agricultura sustentable, biotecnología, medidora de carbono, conservación, fondo verde, aceleradora, etc.)
3. Brief description in Spanish (1-2 sentences)
4. Is it related to Argentina's green/carbon/environmental sector? (yes/no)

Respond ONLY as JSON:
{{"cluster": "...", "categoria": "...", "descripcion": "...", "is_green_argentina": true/false}}
"""

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=500,
        )
        content = response.choices[0].message.content or "{}"
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            if data.get("is_green_argentina", False):
                return DiscoveredNode(
                    nombre=name,
                    link=url,
                    cluster=data.get("cluster", "Startup"),
                    categoria=data.get("categoria", ""),
                    descripcion=data.get("descripcion", ""),
                )
    except Exception as e:
        print(f"Error researching {name}: {e}")
    return None


async def spider_company(
    company_name: str,
    company_url: str | None,
    existing_names: set[str],
) -> ResearchResult:
    """
    Spider a company's website to discover partners and new nodes.

    1. Fetch the company's website
    2. Extract partners/aliados from HTML
    3. For each new partner, research it
    4. Return discovered nodes and relationships
    """
    result = ResearchResult(source_company=company_name)

    if not company_url:
        result.errors.append(f"No URL for {company_name}")
        return result

    # Step 1: Fetch website
    html = await fetch_webpage(company_url)
    if not html:
        result.errors.append(f"Could not fetch {company_url}")
        return result

    # Step 2: Extract partners from HTML
    partners = extract_partners_from_html(html, company_name)
    result.raw_partners_found = [p.get("name", "") for p in partners]

    # Step 3: For each new partner, research it
    for partner in partners:
        partner_name = partner.get("name", "").strip()
        if not partner_name or partner_name.lower() in {n.lower() for n in existing_names}:
            continue

        partner_url = partner.get("link")
        relationship = partner.get("relationship", "partner")

        # Map relationship types
        rel_type = "partners_with"
        if relationship in ("funder", "investor", "backed_by"):
            rel_type = "funds"
        elif relationship in ("client", "customer"):
            rel_type = "client_of"
        elif relationship in ("portfolio", "portfolio_company"):
            rel_type = "portfolio"

        # Research the partner
        node = research_company(partner_name, partner_url)
        if node:
            node.relationship_to_source = f"{company_name} -> {partner_name}"
            node.relationship_type = rel_type
            result.discovered_nodes.append(node)
            existing_names.add(partner_name)

    return result


async def run_research_cycle(
    seed_data_path: str = None,
    max_companies: int = 5,
) -> list[ResearchResult]:
    """
    Run one research cycle:
    1. Load existing nodes
    2. Pick unresearched companies
    3. Spider each one
    4. Return results
    """
    # Load seed data
    if seed_data_path is None:
        seed_data_path = os.path.join(
            os.path.dirname(__file__), "..", "seed", "seed_data.json"
        )

    with open(seed_data_path) as f:
        data = json.load(f)

    existing_names = {n["nombre"] for n in data["nodes"]}
    companies_with_urls = [
        (n["nombre"], n["link"])
        for n in data["nodes"]
        if n.get("link") and not n["link"].startswith("https://www.instagram.com")
    ]

    results = []
    for name, url in companies_with_urls[:max_companies]:
        print(f"Spidering: {name} ({url})...")
        result = await spider_company(name, url, existing_names)
        results.append(result)
        print(
            f"  Found {len(result.raw_partners_found)} partners, "
            f"{len(result.discovered_nodes)} new nodes"
        )

    return results


if __name__ == "__main__":
    import asyncio

    results = asyncio.run(run_research_cycle(max_companies=3))

    total_new = sum(len(r.discovered_nodes) for r in results)
    print(f"\n=== Research Complete ===")
    print(f"Companies spidered: {len(results)}")
    print(f"New nodes discovered: {total_new}")

    for r in results:
        if r.discovered_nodes:
            print(f"\nFrom {r.source_company}:")
            for node in r.discovered_nodes:
                print(f"  - {node.nombre} ({node.cluster}/{node.categoria})")
                print(f"    {node.descripcion}")
                print(f"    Rel: {node.relationship_type}")
