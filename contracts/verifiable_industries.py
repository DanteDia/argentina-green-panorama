# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import re


def extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    if not text or not text.strip():
        return {"error": "empty_response"}
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass
    match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return {"error": "could_not_parse", "raw": text[:200]}


def fetch_page(url: str, max_chars: int = 2500) -> str:
    if not url:
        return "NO_URL"
    try:
        response = gl.nondet.web.get(url)
        return response.body.decode("utf-8")[:max_chars]
    except Exception:
        return "UNAVAILABLE"


def search_ddg(query: str, max_chars: int = 2500) -> str:
    try:
        import urllib.parse
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        response = gl.nondet.web.get(url)
        return response.body.decode("utf-8")[:max_chars]
    except Exception:
        return "SEARCH_UNAVAILABLE"


class VerifiableIndustries(gl.Contract):
    """
    Anti-Hallucination Verification Layer v5.

    Uses prompt_comparative: every validator independently fetches web evidence
    and runs their own LLM. 5 different LLMs cross-checking the same sources.

    Design principle: 1 transaction = 1 claim. No batching.
    Each data point gets its own independent consensus.
    """

    # Storage: each claim stored by composite key
    claim_results: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    # =========================================================================
    # 1. VERIFY EXISTENCE — Does this entity actually exist?
    # =========================================================================

    @gl.public.write
    def verify_existence(self, map_id: str, node_id: str, name: str, url: str) -> str:
        """1 TX = 1 claim: Does this organization exist and is the URL real?"""

        def nondet() -> str:
            site = fetch_page(url, 3000)
            search = search_ddg(f'"{name}"', 2000)

            task = f"""You are fact-checking whether an organization exists.

CLAIM: "{name}" is a real organization with website {url}

EVIDENCE:
=== Website content ({url}) ===
{site}

=== Search results for "{name}" ===
{search}

CHECK:
1. Does the website load and belong to "{name}"?
2. Do search results confirm this organization exists?
3. Could this be a different entity with a similar name?

Respond ONLY as valid JSON:
{{"verified": true/false, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "entity_confusion_risk": "none"/"low"/"medium"/"high"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified boolean must match. confidence must be within one step. entity_confusion_risk must match.",
        )
        key = f"{map_id}:{node_id}:existence"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 2. VERIFY DESCRIPTION — Is the description accurate?
    # =========================================================================

    @gl.public.write
    def verify_description(self, map_id: str, node_id: str, name: str, url: str, claimed_description: str) -> str:
        """1 TX = 1 claim: Is this description factually accurate?"""

        def nondet() -> str:
            site = fetch_page(url, 3000)

            task = f"""You are checking if an AI-generated description is accurate or hallucinated.

ENTITY: {name} ({url})
CLAIMED DESCRIPTION: "{claimed_description}"

EVIDENCE:
=== Website content ===
{site}

BE ADVERSARIAL. Look for:
- Does the website actually say what the description claims?
- Are there buzzwords in the description NOT found on the website?
- Is this a generic description that could apply to any company?
- Could the AI have confused this with a different company?

Respond ONLY as valid JSON:
{{"verified": true/false, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "hallucination_risk": "none"/"low"/"medium"/"high", "suggested_correction": null or "corrected description if wrong"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified boolean must match. hallucination_risk must match. If suggested_correction is provided by both, core meaning must align.",
        )
        key = f"{map_id}:{node_id}:description"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 3. VERIFY SECTOR — Does this entity belong to the claimed sector?
    # =========================================================================

    @gl.public.write
    def verify_sector(self, map_id: str, node_id: str, name: str, url: str, claimed_sector: str, claimed_category: str) -> str:
        """1 TX = 1 claim: Is this entity in the claimed industry sector?"""

        def nondet() -> str:
            site = fetch_page(url, 2500)
            search = search_ddg(f"{name} {claimed_sector}", 2000)

            task = f"""You are checking if an entity belongs to a specific industry sector.

ENTITY: {name} ({url})
CLAIMED SECTOR: {claimed_sector}
CLAIMED CATEGORY: {claimed_category}

EVIDENCE:
=== Website ===
{site}

=== Search "{name} {claimed_sector}" ===
{search}

BE SKEPTICAL. A tech company is not "green/environmental" just because it has a sustainability page.
Only confirm if the entity's CORE business is in the claimed sector.

Respond ONLY as valid JSON:
{{"verified": true/false, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "suggested_sector": null or "correct sector", "suggested_category": null or "correct category"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified boolean must match. If both suggest a different sector, suggestions must align.",
        )
        key = f"{map_id}:{node_id}:sector"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 4. VERIFY RECENCY — Is this entity still active?
    # =========================================================================

    @gl.public.write
    def verify_recency(self, map_id: str, node_id: str, name: str, url: str, country: str) -> str:
        """1 TX = 1 claim: Is this entity still active and operating?"""

        def nondet() -> str:
            site = fetch_page(url, 2500)
            search = search_ddg(f"{name} {country} 2025 OR 2026", 2000)

            task = f"""Check if this organization is still active in 2025-2026.

ENTITY: {name} ({url}) in {country}

EVIDENCE:
=== Website ===
{site}

=== Search for recent activity ===
{search}

Look for:
- Dates on the website (copyright year, blog posts, news)
- Recent search results mentioning this entity
- Signs of abandonment (broken pages, outdated content)

Respond ONLY as valid JSON:
{{"verified": true/false, "confidence": "high"/"medium"/"low", "last_activity_evidence": "what date/evidence found", "geography_confirmed": true/false}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified and geography_confirmed booleans must match. confidence within one step.",
        )
        key = f"{map_id}:{node_id}:recency"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 5. VERIFY FUNDING — Does investor A actually fund company B?
    # =========================================================================

    @gl.public.write
    def verify_funding(self, map_id: str, claim_id: str, investor_name: str, investor_url: str, company_name: str, company_url: str) -> str:
        """1 TX = 1 claim: Does this funding relationship exist? Checks BOTH sides."""

        def nondet() -> str:
            investor_site = fetch_page(investor_url, 2500)
            company_site = fetch_page(company_url, 2500)
            search = search_ddg(f'"{investor_name}" "{company_name}" investment OR funding OR portfolio', 2500)

            task = f"""HIGH-STAKES financial verification. Being wrong misleads investors.

CLAIM: "{investor_name}" funds/invested in "{company_name}"

EVIDENCE:
=== Investor website ({investor_url}) ===
{investor_site}

=== Company website ({company_url}) ===
{company_site}

=== Search for "{investor_name}" + "{company_name}" ===
{search}

CROSS-REFERENCE (both sides must confirm):
1. Does {investor_name}'s website/portfolio LIST {company_name}?
2. Does {company_name}'s website mention {investor_name} as backer/investor?
3. Do independent news sources confirm this?

REQUIRE 2+ sources for "high" confidence. One-sided = "medium" max.

Respond ONLY as valid JSON:
{{"verified": true/false, "investor_lists_company": true/false, "company_lists_investor": true/false, "news_confirms": true/false, "sources_confirming": 0-3, "confidence": "high"/"medium"/"low", "evidence": "max 80 words", "hallucination_risk": "none"/"low"/"medium"/"high"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified, investor_lists_company, company_lists_investor, news_confirms booleans must all match. sources_confirming within 1. hallucination_risk must match.",
        )
        key = f"{map_id}:{claim_id}:funding"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 6. VERIFY RELATIONSHIP — Does this connection exist and what type?
    # =========================================================================

    @gl.public.write
    def verify_relationship(self, map_id: str, edge_id: str, entity_a: str, url_a: str, entity_b: str, url_b: str, claimed_type: str) -> str:
        """1 TX = 1 relationship. Checks both sides for conflict detection."""

        def nondet() -> str:
            site_a = fetch_page(url_a, 2000)
            site_b = fetch_page(url_b, 2000)
            search = search_ddg(f'"{entity_a}" "{entity_b}"', 2500)

            task = f"""Verify a claimed relationship between two entities.

CLAIM: {entity_a} has a "{claimed_type}" relationship with {entity_b}

Relationship types:
- "funds": A provides money/investment to B
- "partners_with": A and B collaborate as allies
- "client_of": B is a client/customer of A
- "portfolio": B is in A's accelerator/portfolio
- "regulates": A has regulatory authority over B
- "sponsors": A sponsors B
- "competes_with": A and B are competitors

EVIDENCE:
=== {entity_a} website ({url_a}) ===
{site_a}

=== {entity_b} website ({url_b}) ===
{site_b}

=== Search "{entity_a}" + "{entity_b}" ===
{search}

CONFLICT DETECTION:
- Does A mention B? Does B mention A? If only one side → flag it.
- Is the TYPE correct? "partner" vs "client" vs "investor" matters.

Respond ONLY as valid JSON:
{{"verified": true/false, "type_accurate": true/false, "suggested_type": "{claimed_type}" or corrected type, "a_mentions_b": true/false, "b_mentions_a": true/false, "conflict_detected": null or "description of conflict", "confidence": "high"/"medium"/"low", "evidence": "max 80 words"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified and type_accurate booleans must match. suggested_type must match. a_mentions_b and b_mentions_a must match. If conflict_detected, both must flag a conflict.",
        )
        key = f"{map_id}:{edge_id}:relationship"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 7. VERIFY SOCIAL — Is this social profile real and active?
    # =========================================================================

    @gl.public.write
    def verify_social(self, map_id: str, node_id: str, name: str, platform: str, social_url: str, claimed_followers: str) -> str:
        """1 TX = 1 social profile. Independently verified by all validators."""

        def nondet() -> str:
            content = fetch_page(social_url, 3000)

            task = f"""Verify a social media profile belongs to an entity and is authentic.

ENTITY: {name}
PLATFORM: {platform}
PROFILE URL: {social_url}
CLAIMED FOLLOWERS: {claimed_followers}

EVIDENCE:
=== Profile page content ===
{content}

CHECK:
1. Does this URL load a real {platform} profile?
2. Does the profile name/bio match "{name}"?
3. Is this a real account (not impersonator/fake)?
4. What's the visible follower count?
5. Does follower count roughly match "{claimed_followers}"?
6. Is the account active (recent posts)?

Respond ONLY as valid JSON:
{{"verified": true/false, "belongs_to_entity": true/false, "is_authentic": true/false, "estimated_followers": "count as string", "follower_match": true/false, "activity_level": "active"/"dormant"/"dead", "confidence": "high"/"medium"/"low"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="verified, belongs_to_entity, is_authentic, follower_match booleans must match. activity_level must match. estimated_followers must be in same order of magnitude.",
        )
        key = f"{map_id}:{node_id}:social:{platform}"
        self.claim_results[key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # 8. DETECT HALLUCINATION — Adversarial check on full agent output
    # =========================================================================

    @gl.public.write
    def detect_hallucination(self, map_id: str, node_id: str, name: str, url: str, agent_output: str) -> str:
        """Adversarial scan of AI agent output. Hunts for what's WRONG."""

        def nondet() -> str:
            site = fetch_page(url, 3000)
            search = search_ddg(f'"{name}"', 2000)

            agent_data = json.loads(agent_output)
            funding = agent_data.get("quien_fondea", "")
            funding_search = search_ddg(f"{name} funding {funding}", 2000) if funding else ""

            task = f"""You are a SKEPTICAL investigator. Find what's WRONG with this AI-generated data.
Do NOT confirm things. CHALLENGE every claim.

ENTITY: {name}
AI-GENERATED DATA:
{agent_output}

REAL EVIDENCE:
=== Website ({url}) ===
{site}

=== Search "{name}" ===
{search}

=== Funding search ===
{funding_search}

For each field, ask: "Can I find INDEPENDENT evidence for this claim?"
If not → flag as potential hallucination.

Respond ONLY as valid JSON:
{{"hallucinations": [{{"field": "field_name", "claim": "the suspect claim", "severity": "critical"/"major"/"minor", "reason": "why suspect"}}], "confirmed_fields": ["list"], "overall_reliability": "reliable"/"mixed"/"unreliable"}}
"""
            result = gl.nondet.exec_prompt(task)
            return json.dumps(extract_json(result), sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="Hallucinations found must flag the same fields. overall_reliability must match. confirmed_fields must overlap by 70%+.",
        )
        key = f"{map_id}:{node_id}:hallucination"
        self.claim_results[key] = result_str
        return result_str

    # =========================================================================
    # READ METHODS — retrieve any verification result
    # =========================================================================

    @gl.public.view
    def get_claim(self, map_id: str, claim_key: str) -> str:
        """Generic reader. claim_key examples: 'node123:existence', 'edge456:relationship', 'node123:social:twitter'"""
        key = f"{map_id}:{claim_key}"
        if key in self.claim_results:
            return self.claim_results[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_node_verification(self, map_id: str, node_id: str) -> str:
        """Get all claim results for a node (existence, description, sector, recency)."""
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
