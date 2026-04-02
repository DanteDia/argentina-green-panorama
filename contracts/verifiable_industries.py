# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import re


def extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks and preamble."""
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
    """Fetch a web page, return truncated content or error marker."""
    if not url:
        return "NO_URL_PROVIDED"
    try:
        response = gl.nondet.web.get(url)
        return response.body.decode("utf-8")[:max_chars]
    except Exception:
        return "WEBSITE_UNAVAILABLE"


def search_ddg(query: str, max_chars: int = 2500) -> str:
    """Search DuckDuckGo HTML, return truncated results."""
    try:
        import urllib.parse
        search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        response = gl.nondet.web.get(search_url)
        return response.body.decode("utf-8")[:max_chars]
    except Exception:
        return "SEARCH_UNAVAILABLE"


class VerifiableIndustries(gl.Contract):
    """
    Anti-Hallucination Verification Layer for Autonomous AI Research Agents.

    v4: Claim-based atomic verification.

    Instead of verifying a whole entity at once, breaks data into individual
    testable claims. Each claim is cross-referenced against 3+ sources.
    Specifically designed to catch LLM hallucinations in:
    - Funding relationships (high stakes)
    - Partnership claims (conflict detection)
    - Company descriptions (entity disambiguation)
    - Recency of data (stale vs current)

    Uses GenLayer's Optimistic Democracy consensus: 5 independent validators
    each running different LLMs cross-check every claim.
    """

    # On-chain storage
    claim_verifications: TreeMap[str, str]
    hallucination_reports: TreeMap[str, str]
    financial_verifications: TreeMap[str, str]
    trust_scores: TreeMap[str, str]
    # Legacy compatibility
    verifications: TreeMap[str, str]
    relationship_verifications: TreeMap[str, str]
    social_verifications: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    # =========================================================================
    # WRITE METHOD 1: verify_claims — Atomic Claim Verification
    # =========================================================================

    @gl.public.write
    def verify_claims(
        self,
        map_id: str,
        node_id: str,
        entity_name: str,
        entity_url: str,
        claims_json: str,
    ) -> str:
        """
        Verify a batch of atomic claims about an entity.

        claims_json is a JSON array:
        [
          {"id": "fund_1", "type": "funding", "claim": "Antom funds Kilimo",
           "counterparty_url": "https://antom.la"},
          {"id": "desc_1", "type": "description", "claim": "Kilimo is an irrigation platform"},
          {"id": "active_1", "type": "recency", "claim": "Kilimo is active in 2026"},
          {"id": "rel_1", "type": "relationship", "claim": "Kilimo partners with Coca-Cola",
           "claimed_type": "partners_with", "counterparty_url": "https://coca-cola.com.ar"}
        ]

        Claim types: funding, description, relationship, recency, classification
        """

        def nondet() -> str:
            claims = json.loads(claims_json)

            # Source 1: Entity's own website
            entity_content = fetch_page(entity_url, 3000)

            # Source 2: DuckDuckGo search for entity
            entity_search = search_ddg(f"{entity_name}")

            # Source 3: For each claim with a counterparty, fetch their site too
            counterparty_evidence = {}
            for claim in claims:
                cp_url = claim.get("counterparty_url", "")
                if cp_url and cp_url not in counterparty_evidence:
                    counterparty_evidence[cp_url] = fetch_page(cp_url, 2000)

            # Source 4: For relationship/funding claims, search both names together
            relationship_searches = {}
            for claim in claims:
                if claim["type"] in ("funding", "relationship"):
                    # Extract the other entity's name from the claim
                    search_q = claim["claim"]
                    if search_q not in relationship_searches:
                        relationship_searches[search_q] = search_ddg(search_q, 2000)

            # Build evidence summary
            evidence = f"""=== ENTITY WEBSITE ({entity_url}) ===
{entity_content}

=== SEARCH RESULTS FOR "{entity_name}" ===
{entity_search}
"""
            for url, content in counterparty_evidence.items():
                evidence += f"\n=== COUNTERPARTY WEBSITE ({url}) ===\n{content}\n"

            for query, results in relationship_searches.items():
                evidence += f"\n=== SEARCH: "{query}" ===\n{results}\n"

            claims_text = json.dumps(claims, indent=2)

            task = f"""You are an ADVERSARIAL fact-checker hunting for hallucinations in AI-generated data.
Your job is to DISPROVE claims, not confirm them. Only mark a claim as verified if you find strong evidence.

ENTITY: {entity_name} ({entity_url})

CLAIMS TO VERIFY:
{claims_text}

EVIDENCE COLLECTED:
{evidence}

For EACH claim, determine:

1. Is there CONCRETE evidence supporting this claim? (not just "plausible")
2. For FUNDING claims: Does the funder's website/portfolio list this company? Do news articles confirm?
3. For RELATIONSHIP claims: Do BOTH parties acknowledge the relationship? What TYPE is it really?
4. For DESCRIPTION claims: Does the website content match the description, or was this fabricated?
5. For RECENCY claims: Are there dates from 2025-2026 proving current activity?
6. For CLASSIFICATION claims: Is there evidence this entity belongs to the claimed sector?

CONFLICT DETECTION: If entity A claims to partner with B, but B's website doesn't mention A, that's a RED FLAG.

HALLUCINATION SIGNALS:
- Claim sounds plausible but NO web evidence supports it → likely hallucinated
- Only the entity's own website mentions it (self-reported) → low confidence
- Counterparty doesn't acknowledge the relationship → possible hallucination
- Generic description that could apply to any company → possibly fabricated

Respond ONLY as valid JSON:
{{
  "claims": [
    {{
      "id": "<claim_id>",
      "verified": true/false,
      "confidence": "high"/"medium"/"low",
      "evidence_summary": "Where evidence was found (max 80 words)",
      "sources_checked": <number>,
      "sources_confirming": <number>,
      "hallucination_risk": "none"/"low"/"medium"/"high",
      "type_correction": null or "correct_type_here",
      "conflict_detected": null or "describe conflict"
    }}
  ],
  "hallucination_flags": ["list of claims with high hallucination risk"],
  "overall_trust_score": 0.0 to 1.0
}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="The verified/false boolean for each claim must match. Confidence levels must be within one step (high vs medium OK, high vs low NOT OK). Hallucination flags must identify the same claims. Trust score must be within 0.15. The key facts in evidence_summary must align even if wording differs.",
        )

        storage_key = f"{map_id}:{node_id}"
        self.claim_verifications[storage_key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)

        # Compute and store trust score
        try:
            parsed = extract_json(result_str)
            score = parsed.get("overall_trust_score", 0.5)
            self.trust_scores[storage_key] = json.dumps({
                "score": score,
                "claims_verified": sum(1 for c in parsed.get("claims", []) if c.get("verified")),
                "claims_total": len(parsed.get("claims", [])),
                "hallucinations_flagged": len(parsed.get("hallucination_flags", [])),
            })
        except Exception:
            pass

        return result_str

    # =========================================================================
    # WRITE METHOD 2: detect_hallucination — Adversarial Hallucination Hunter
    # =========================================================================

    @gl.public.write
    def detect_hallucination(
        self,
        map_id: str,
        node_id: str,
        entity_name: str,
        entity_url: str,
        agent_output: str,
    ) -> str:
        """
        Takes raw AI agent output and specifically hunts for hallucinations.
        Uses adversarial prompting — asks validators to find what's WRONG.

        agent_output: JSON string of what the research agent produced
        (description, funding, partners, classification, etc.)
        """

        def nondet() -> str:
            # Fetch entity website
            entity_content = fetch_page(entity_url, 3000)

            # Search for entity
            search_1 = search_ddg(f"{entity_name}", 2000)

            # Parse agent output to find specific claims to check
            agent_data = json.loads(agent_output)
            funding_claims = agent_data.get("quien_fondea", "")
            partners = agent_data.get("aliados_portfolio", [])
            description = agent_data.get("descripcion", "")

            # Search for funding claims specifically
            funding_search = ""
            if funding_claims:
                funding_search = search_ddg(f"{entity_name} funding investment {funding_claims}", 2000)

            # Search for partner claims
            partner_search = ""
            if partners and len(partners) > 0:
                partner_search = search_ddg(f"{entity_name} {partners[0] if isinstance(partners, list) else partners}", 2000)

            task = f"""You are a SKEPTICAL investigator. Your ONLY job is to find what's WRONG
with this AI-generated research data. Do NOT confirm things — CHALLENGE them.

ENTITY: {entity_name}
AGENT-GENERATED DATA:
{agent_output}

REAL EVIDENCE:
=== Website ({entity_url}) ===
{entity_content}

=== Search for "{entity_name}" ===
{search_1}

=== Search for funding claims ===
{funding_search}

=== Search for partner claims ===
{partner_search}

CHECK EACH FIELD:

1. DESCRIPTION: Does the website actually say this? Or did the LLM fabricate a plausible-sounding description?
   - Red flag: description uses buzzwords not found on the actual website

2. FUNDING SOURCES: Can you find ANY independent confirmation of these funders?
   - Red flag: funder names that don't appear in any search results
   - Red flag: well-known fund names attached to small companies (likely hallucinated)

3. PARTNERS/ALLIES: Does the OTHER company acknowledge this partnership?
   - Red flag: one-sided claims with no reciprocal mention

4. CLASSIFICATION: Is this really in the claimed sector?
   - Red flag: generic tech company classified as "green/environmental" without evidence

5. ENTITY CONFUSION: Could this be a DIFFERENT company with a similar name?
   - Red flag: data mixing two different entities

Respond ONLY as valid JSON:
{{
  "hallucinations_found": [
    {{
      "field": "quien_fondea"/"descripcion"/"aliados_portfolio"/"cluster"/"categoria",
      "claim": "the specific claim that's wrong",
      "evidence": "why it's likely hallucinated (max 60 words)",
      "severity": "critical"/"major"/"minor",
      "suggestion": "what should replace it, or 'remove'"
    }}
  ],
  "fields_confirmed": ["list of fields that check out"],
  "entity_confusion_risk": "none"/"low"/"medium"/"high",
  "overall_reliability": "reliable"/"mixed"/"unreliable",
  "reasoning": "1-2 sentence summary of findings"
}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="Hallucinations found must flag the same fields with matching severity (critical/major/minor). Fields confirmed must overlap by at least 70%. Entity confusion risk must match exactly. Overall reliability must agree (reliable/mixed/unreliable). Specific hallucination claims must identify the same problematic data.",
        )

        storage_key = f"{map_id}:{node_id}"
        self.hallucination_reports[storage_key] = result_str
        return result_str

    # =========================================================================
    # WRITE METHOD 3: verify_financial — High-Stakes Financial Claims
    # =========================================================================

    @gl.public.write
    def verify_financial(
        self,
        map_id: str,
        claim_id: str,
        investor_name: str,
        investor_url: str,
        company_name: str,
        company_url: str,
        claimed_amount: str,
        claimed_year: str,
    ) -> str:
        """
        Dedicated verification for financial/funding claims.
        Checks BOTH sides + news + cross-references.
        """

        def nondet() -> str:
            # Fetch investor's website (look for portfolio page)
            investor_content = fetch_page(investor_url, 2500)

            # Fetch company's website (look for "backed by" section)
            company_content = fetch_page(company_url, 2500)

            # Search for the specific investment
            investment_search = search_ddg(
                f'"{investor_name}" "{company_name}" investment funding', 2500
            )

            # Search on Bing too for cross-reference
            bing_search = ""
            try:
                import urllib.parse
                bing_url = f"https://www.bing.com/search?q={urllib.parse.quote(f'{investor_name} {company_name} funding {claimed_year}')}"
                response = gl.nondet.web.get(bing_url)
                bing_search = response.body.decode("utf-8")[:2000]
            except Exception:
                bing_search = "BING_UNAVAILABLE"

            task = f"""You are verifying a HIGH-STAKES financial claim. Being wrong here could mislead investors.
BE EXTREMELY RIGOROUS. Only confirm if you find CONCRETE evidence.

CLAIM: "{investor_name}" invested in/funded "{company_name}"
Amount claimed: {claimed_amount}
Year claimed: {claimed_year}

=== INVESTOR WEBSITE ({investor_url}) ===
{investor_content}

=== COMPANY WEBSITE ({company_url}) ===
{company_content}

=== SEARCH: "{investor_name}" + "{company_name}" + funding ===
{investment_search}

=== BING SEARCH ===
{bing_search}

VERIFY:
1. Is {investor_name} actually a fund/investor? (not just any company)
2. Does {investor_name}'s portfolio/website LIST {company_name}?
3. Does {company_name}'s website mention {investor_name} as backer?
4. Do news articles confirm this investment?
5. Is the claimed amount plausible?
6. Is this from {claimed_year} or is the date wrong?

CROSS-REFERENCE REQUIREMENT: At least 2 independent sources must confirm.
One-sided claims (only on one website) get medium confidence max.

Respond ONLY as valid JSON:
{{
  "investment_confirmed": true/false,
  "investor_is_fund": true/false,
  "investor_lists_company": true/false,
  "company_lists_investor": true/false,
  "news_confirms": true/false,
  "amount_plausible": true/false/null,
  "year_confirmed": true/false/null,
  "sources_confirming": <number out of 4 checked>,
  "confidence": "high"/"medium"/"low",
  "evidence_summary": "Specific evidence found (max 100 words)",
  "hallucination_risk": "none"/"low"/"medium"/"high"
}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            nondet,
            principle="investment_confirmed boolean must match exactly. investor_lists_company and company_lists_investor booleans must match. news_confirms must match. sources_confirming must be within 1. confidence must match or be adjacent (high/medium OK, high/low NOT OK). hallucination_risk must match exactly.",
        )

        storage_key = f"{map_id}:{claim_id}"
        self.financial_verifications[storage_key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    # =========================================================================
    # LEGACY WRITE METHODS (kept for backward compatibility)
    # =========================================================================

    @gl.public.write
    def verify_node(self, map_id: str, node_id: str, name: str, link: str,
                    sector: str, category: str, description: str, country: str,
                    claimed_funding: str) -> str:
        """Legacy: verify a whole node at once. Delegates to verify_claims internally."""
        claims = [
            {"id": "exists", "type": "description", "claim": f"{name} exists and is a real organization"},
            {"id": "sector", "type": "classification", "claim": f"{name} operates in the {sector} sector"},
            {"id": "desc", "type": "description", "claim": description},
            {"id": "geo", "type": "recency", "claim": f"{name} is active in {country}"},
        ]
        if claimed_funding:
            claims.append({"id": "funding", "type": "funding", "claim": f"{name} is funded by {claimed_funding}"})

        return self.verify_claims(map_id, node_id, name, link, json.dumps(claims))

    @gl.public.write
    def verify_relationship(self, map_id: str, edge_id: str, node_a_name: str,
                            node_a_link: str, node_b_name: str, node_b_link: str,
                            relationship_type: str, relationship_description: str,
                            sector: str, country: str) -> str:
        """Legacy: verify a relationship. Wraps verify_claims with relationship claim."""
        claims = [
            {"id": "rel", "type": "relationship", "claim": f"{node_a_name} has a {relationship_type} relationship with {node_b_name}",
             "claimed_type": relationship_type, "counterparty_url": node_b_link},
        ]
        return self.verify_claims(map_id, edge_id, node_a_name, node_a_link, json.dumps(claims))

    # =========================================================================
    # READ METHODS
    # =========================================================================

    @gl.public.view
    def get_claims_verification(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        if key in self.claim_verifications:
            return self.claim_verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_hallucination_report(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        if key in self.hallucination_reports:
            return self.hallucination_reports[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_financial_verification(self, map_id: str, claim_id: str) -> str:
        key = f"{map_id}:{claim_id}"
        if key in self.financial_verifications:
            return self.financial_verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_trust_score(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        if key in self.trust_scores:
            return self.trust_scores[key]
        return json.dumps({"score": 0, "claims_verified": 0, "claims_total": 0, "hallucinations_flagged": 0})

    # Legacy read methods
    @gl.public.view
    def get_verification(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        # Check new system first, fall back to legacy
        if key in self.claim_verifications:
            return self.claim_verifications[key]
        if key in self.verifications:
            return self.verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_relationship_verification(self, map_id: str, edge_id: str) -> str:
        key = f"{map_id}:{edge_id}"
        if key in self.claim_verifications:
            return self.claim_verifications[key]
        if key in self.relationship_verifications:
            return self.relationship_verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_social_verification(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        if key in self.social_verifications:
            return self.social_verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_stats(self) -> str:
        return json.dumps({"total_verifications": int(self.verification_count)})
