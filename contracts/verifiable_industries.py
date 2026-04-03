# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


# =========================================================================
# Helpers — minimal, let GenLayer + LLMs do the heavy lifting
# =========================================================================

def render_page(url: str, max_chars: int = 4000) -> str:
    """Render a web page with JavaScript execution. Captures dynamic content."""
    if not url:
        return "NO_URL"
    try:
        content = gl.nondet.web.render(url, mode='html')
        return content[:max_chars] if isinstance(content, str) else content.decode("utf-8")[:max_chars]
    except Exception:
        return "[EXTERNAL] Page unavailable"


def search_web(query: str, max_chars: int = 3000) -> str:
    """Search via Bing (bot-friendly). Renders JS for full results."""
    try:
        import urllib.parse
        url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
        content = gl.nondet.web.render(url, mode='html')
        return content[:max_chars] if isinstance(content, str) else content.decode("utf-8")[:max_chars]
    except Exception:
        return "[EXTERNAL] Search unavailable"


class VerifiableIndustries(gl.Contract):
    """
    Anti-Hallucination Verification Layer for Autonomous AI Research Agents.
    v6 — Built with GenLayer best practices.

    Architecture:
    - 1 transaction = 1 claim (no batching)
    - web.render() for JS-rendered pages (captures dynamic sponsors, portfolios)
    - response_format="json" on all exec_prompt calls
    - prompt_comparative: every validator independently fetches + reasons
    - Consensus compares DECISIONS (booleans), not raw evidence

    8 write methods: existence, description, sector, recency,
    funding, relationship, social, hallucination detection.
    """

    claim_results: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    # =========================================================================
    # 1. VERIFY EXISTENCE
    # =========================================================================

    @gl.public.write
    def verify_existence(self, map_id: str, node_id: str, name: str, url: str) -> str:
        def nondet() -> str:
            site = render_page(url)
            search = search_web(f'"{name}"')
            result = gl.nondet.exec_prompt(
                f"""Fact-check: does "{name}" exist as a real organization with website {url}?

EVIDENCE:
=== Rendered website ({url}) ===
{site}

=== Bing search for "{name}" ===
{search}

Determine:
1. Does the website load and belong to "{name}"?
2. Do search results confirm this organization exists?
3. Could this be a DIFFERENT entity with a similar name?

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "entity_confusion_risk": "none"/"low"/"medium"/"high"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified boolean must match. confidence within one step. entity_confusion_risk must match.")
        self.claim_results[f"{map_id}:{node_id}:existence"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 2. VERIFY DESCRIPTION
    # =========================================================================

    @gl.public.write
    def verify_description(self, map_id: str, node_id: str, name: str, url: str, claimed_description: str) -> str:
        def nondet() -> str:
            site = render_page(url)
            result = gl.nondet.exec_prompt(
                f"""BE ADVERSARIAL. Check if this AI-generated description is accurate or hallucinated.

ENTITY: {name} ({url})
CLAIMED: "{claimed_description}"

=== Rendered website ===
{site}

Red flags:
- Buzzwords NOT on the actual website
- Generic description fitting any company
- Entity confusion with a different company

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "hallucination_risk": "none"/"low"/"medium"/"high", "suggested_correction": null or "corrected text"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified boolean must match. hallucination_risk must match.")
        self.claim_results[f"{map_id}:{node_id}:description"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 3. VERIFY SECTOR
    # =========================================================================

    @gl.public.write
    def verify_sector(self, map_id: str, node_id: str, name: str, url: str, claimed_sector: str, claimed_category: str) -> str:
        def nondet() -> str:
            site = render_page(url)
            search = search_web(f"{name} {claimed_sector}")
            result = gl.nondet.exec_prompt(
                f"""Does {name}'s CORE business belong to the {claimed_sector} sector?

CLAIMED SECTOR: {claimed_sector}
CLAIMED CATEGORY: {claimed_category}

=== Rendered website ({url}) ===
{site}

=== Bing search ===
{search}

BE SKEPTICAL. A tech company with a sustainability page is NOT "green/environmental".
Only confirm if the core business is in the claimed sector.

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "suggested_sector": null or "correct sector", "suggested_category": null or "correct category"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified boolean must match. If both suggest different sector, suggestions must align.")
        self.claim_results[f"{map_id}:{node_id}:sector"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 4. VERIFY RECENCY
    # =========================================================================

    @gl.public.write
    def verify_recency(self, map_id: str, node_id: str, name: str, url: str, country: str) -> str:
        def nondet() -> str:
            site = render_page(url)
            search = search_web(f"{name} {country} 2025 OR 2026")
            result = gl.nondet.exec_prompt(
                f"""Is {name} still active and operating in {country} as of 2025-2026?

=== Rendered website ({url}) ===
{site}

=== Bing search for recent activity ===
{search}

Look for: copyright year, recent blog posts, recent news, or signs of abandonment.

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "last_activity_evidence": "date or evidence found", "geography_confirmed": bool}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified and geography_confirmed booleans must match. confidence within one step.")
        self.claim_results[f"{map_id}:{node_id}:recency"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 5. VERIFY FUNDING — High stakes, checks BOTH sides
    # =========================================================================

    @gl.public.write
    def verify_funding(self, map_id: str, claim_id: str, investor_name: str, investor_url: str, company_name: str, company_url: str) -> str:
        def nondet() -> str:
            investor_site = render_page(investor_url)
            company_site = render_page(company_url)
            search = search_web(f'"{investor_name}" "{company_name}" investment OR funding')
            result = gl.nondet.exec_prompt(
                f"""HIGH-STAKES financial verification.

CLAIM: "{investor_name}" funds/invested in "{company_name}"

=== Investor website ({investor_url}) — rendered with JS ===
{investor_site}

=== Company website ({company_url}) — rendered with JS ===
{company_site}

=== Bing search ===
{search}

Cross-reference BOTH sides:
1. Does investor's website/portfolio list the company?
2. Does company's website mention the investor as backer?
3. Do independent news sources confirm?

REQUIRE 2+ sources for "high" confidence. One-sided = "medium" max.

Return JSON: {{"verified": bool, "investor_lists_company": bool, "company_lists_investor": bool, "news_confirms": bool, "sources_confirming": int, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "hallucination_risk": "none"/"low"/"medium"/"high"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified, investor_lists_company, company_lists_investor, news_confirms booleans must all match. sources_confirming within 1. hallucination_risk must match.")
        self.claim_results[f"{map_id}:{claim_id}:funding"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 6. VERIFY RELATIONSHIP — Conflict detection
    # =========================================================================

    @gl.public.write
    def verify_relationship(self, map_id: str, edge_id: str, entity_a: str, url_a: str, entity_b: str, url_b: str, claimed_type: str) -> str:
        def nondet() -> str:
            site_a = render_page(url_a)
            site_b = render_page(url_b)
            search = search_web(f'"{entity_a}" "{entity_b}"')
            result = gl.nondet.exec_prompt(
                f"""Verify: {entity_a} has a "{claimed_type}" relationship with {entity_b}.

Types: "funds" (A invests in B), "partners_with" (allies), "client_of" (B is A's customer),
"portfolio" (B in A's accelerator), "regulates" (A regulates B), "sponsors" (A sponsors B),
"competes_with" (competitors)

=== {entity_a} website ({url_a}) — rendered with JS ===
{site_a}

=== {entity_b} website ({url_b}) — rendered with JS ===
{site_b}

=== Bing search "{entity_a}" + "{entity_b}" ===
{search}

CONFLICT DETECTION: Does A mention B? Does B mention A? One-sided = flag it.
Is the TYPE correct? "partner" vs "client" vs "sponsor" matters.

Return JSON: {{"verified": bool, "type_accurate": bool, "suggested_type": "the correct type", "a_mentions_b": bool, "b_mentions_a": bool, "conflict_detected": null or "describe", "confidence": "high"/"medium"/"low", "evidence": "max 80 words"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified and type_accurate booleans must match. suggested_type must match. a_mentions_b and b_mentions_a must match.")
        self.claim_results[f"{map_id}:{edge_id}:relationship"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 7. VERIFY SOCIAL — Per-platform profile check
    # =========================================================================

    @gl.public.write
    def verify_social(self, map_id: str, node_id: str, name: str, platform: str, social_url: str, claimed_followers: str) -> str:
        def nondet() -> str:
            content = render_page(social_url)
            result = gl.nondet.exec_prompt(
                f"""Verify this {platform} profile belongs to {name} and is authentic.

PROFILE: {social_url}
CLAIMED FOLLOWERS: {claimed_followers}

=== Rendered profile page ===
{content}

Check: real profile? matches "{name}"? authentic (not fake)? follower count matches? active?

Return JSON: {{"verified": bool, "belongs_to_entity": bool, "is_authentic": bool, "estimated_followers": "count as string", "follower_match": bool, "activity_level": "active"/"dormant"/"dead", "confidence": "high"/"medium"/"low"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="verified, belongs_to_entity, is_authentic, follower_match booleans must match. activity_level must match.")
        self.claim_results[f"{map_id}:{node_id}:social:{platform}"] = r
        self.verification_count = u256(int(self.verification_count) + 1)
        return r

    # =========================================================================
    # 8. DETECT HALLUCINATION — Adversarial agent output scan
    # =========================================================================

    @gl.public.write
    def detect_hallucination(self, map_id: str, node_id: str, name: str, url: str, agent_output: str) -> str:
        def nondet() -> str:
            site = render_page(url)
            search = search_web(f'"{name}"')
            agent_data = json.loads(agent_output)
            funding = agent_data.get("quien_fondea", "")
            funding_search = search_web(f"{name} funding {funding}") if funding else ""
            result = gl.nondet.exec_prompt(
                f"""You are a SKEPTICAL investigator. Find what's WRONG. Do NOT confirm — CHALLENGE every claim.

ENTITY: {name}
AI-GENERATED DATA:
{agent_output}

=== Rendered website ({url}) ===
{site}

=== Bing search "{name}" ===
{search}

=== Funding search ===
{funding_search}

For each field: can you find INDEPENDENT evidence? If not → flag as hallucination.

Return JSON: {{"hallucinations": [{{"field": "name", "claim": "suspect claim", "severity": "critical"/"major"/"minor", "reason": "why suspect"}}], "confirmed_fields": ["list"], "overall_reliability": "reliable"/"mixed"/"unreliable"}}""",
                response_format="json",
            )
            return json.dumps(json.loads(result), sort_keys=True)

        r = gl.eq_principle.prompt_comparative(nondet, principle="Hallucinations must flag same fields. overall_reliability must match. confirmed_fields must overlap by 70%+.")
        self.claim_results[f"{map_id}:{node_id}:hallucination"] = r
        return r

    # =========================================================================
    # READ METHODS
    # =========================================================================

    @gl.public.view
    def get_claim(self, map_id: str, claim_key: str) -> str:
        key = f"{map_id}:{claim_key}"
        if key in self.claim_results:
            return self.claim_results[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_node_verification(self, map_id: str, node_id: str) -> str:
        results = {}
        for suffix in ["existence", "description", "sector", "recency", "hallucination"]:
            key = f"{map_id}:{node_id}:{suffix}"
            if key in self.claim_results:
                try:
                    results[suffix] = json.loads(self.claim_results[key])
                except Exception:
                    results[suffix] = self.claim_results[key]
        return json.dumps(results)

    @gl.public.view
    def get_stats(self) -> str:
        return json.dumps({"total_verifications": int(self.verification_count)})
