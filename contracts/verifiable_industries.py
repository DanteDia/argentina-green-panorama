# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


# =========================================================================
# Error Classification — critical for consensus on failure paths
# =========================================================================

ERROR_EXPECTED = "[EXPECTED]"    # Business logic (deterministic) — must match exactly
ERROR_EXTERNAL = "[EXTERNAL]"    # Website 4xx (deterministic) — must match exactly
ERROR_TRANSIENT = "[TRANSIENT]"  # Network timeout (non-deterministic) — agree if both fail
ERROR_LLM = "[LLM_ERROR]"       # LLM garbage — always disagree, force leader rotation


# =========================================================================
# Defensive Coercion — LLMs return unpredictable formats
# =========================================================================

def _coerce_bool(val) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower().strip() in ("true", "yes", "1", "confirmed", "verified")
    return bool(val)


def _coerce_confidence(val) -> str:
    if not isinstance(val, str):
        val = str(val)
    val = val.lower().strip()
    if val in ("high", "h", "3"):
        return "high"
    if val in ("medium", "med", "m", "moderate", "2"):
        return "medium"
    return "low"


CONFIDENCE_ORDER = {"high": 2, "medium": 1, "low": 0}

def _confidence_close(a: str, b: str) -> bool:
    """high↔medium OK, high↔low NOT OK."""
    return abs(CONFIDENCE_ORDER.get(a, 0) - CONFIDENCE_ORDER.get(b, 0)) <= 1


# =========================================================================
# Web Helpers
# =========================================================================

def render_page(url: str, max_chars: int = 4000) -> str:
    """Render page with JavaScript execution. Captures dynamic content."""
    if not url:
        return ""
    try:
        content = gl.nondet.web.render(url, mode='html')
        text = content if isinstance(content, str) else content.decode("utf-8")
        return text[:max_chars]
    except Exception as e:
        err = str(e).lower()
        if "timeout" in err or "connection" in err:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} {url} unavailable")
        return ""


# =========================================================================
# Error Handler — canonical pattern from GenLayer Skills
# =========================================================================

def _handle_leader_error(leaders_res, leader_fn) -> bool:
    leader_msg = leaders_res.message if hasattr(leaders_res, 'message') else ''
    try:
        leader_fn()
        return False  # Leader errored, validator succeeded — disagree
    except gl.vm.UserError as e:
        validator_msg = e.message if hasattr(e, 'message') else str(e)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False  # LLM or unknown — disagree, force retry
    except Exception:
        return False


# =========================================================================
# LLM Call Helper
# =========================================================================

def _ask_llm(prompt: str) -> dict:
    """Call LLM with JSON response format, defensively parse."""
    try:
        result = gl.nondet.exec_prompt(prompt, response_format="json")
        if isinstance(result, str):
            return json.loads(result)
        if isinstance(result, dict):
            return result
        raise gl.vm.UserError(f"{ERROR_LLM} Non-dict/str response: {type(result)}")
    except json.JSONDecodeError:
        # Try to extract JSON from messy response
        text = str(result)
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                pass
        raise gl.vm.UserError(f"{ERROR_LLM} Unparseable: {text[:100]}")


# =========================================================================
# Contract
# =========================================================================

class VerifiableIndustries(gl.Contract):
    """
    Anti-Hallucination Verification Layer v7.

    Built with GenLayer Skills best practices:
    - run_nondet_unsafe with custom validator functions
    - web.render() for JS-rendered pages
    - response_format="json" on all LLM calls
    - Error classification for consensus on failure paths
    - Defensive coercion for LLM output
    - 1 TX = 1 claim, no batching

    Verification order: existence → description → sector → recency
    → social (first!) → funding (uses social) → relationship (uses social)
    """

    claim_results: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    def _store(self, key: str, result: dict) -> str:
        serialized = json.dumps(result, sort_keys=True)
        self.claim_results[key] = serialized
        self.verification_count = u256(int(self.verification_count) + 1)
        return serialized

    # =====================================================================
    # 1. VERIFY EXISTENCE
    # =====================================================================

    @gl.public.write
    def verify_existence(self, map_id: str, node_id: str, name: str, url: str) -> str:

        def leader_fn():
            site = render_page(url)
            if not site:
                raise gl.vm.UserError(f"{ERROR_EXTERNAL} Website empty or unavailable: {url}")

            raw = _ask_llm(f"""Fact-check: does "{name}" exist as a real organization?

Website ({url}):
{site}

Using this website content AND your own knowledge, determine:
1. Does the website belong to "{name}"?
2. Is this a real, operating organization?
3. Could this be confused with a DIFFERENT entity?

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "evidence": "max 60 words", "entity_confusion_risk": "none"/"low"/"medium"/"high"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "entity_confusion_risk": str(raw.get("entity_confusion_risk", "low")),
                "evidence": str(raw.get("evidence", ""))[:100],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if not _confidence_close(mine["confidence"], leader["confidence"]):
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{node_id}:existence", result)

    # =====================================================================
    # 2. VERIFY DESCRIPTION
    # =====================================================================

    @gl.public.write
    def verify_description(self, map_id: str, node_id: str, name: str, url: str, claimed_description: str) -> str:

        def leader_fn():
            site = render_page(url)

            raw = _ask_llm(f"""BE ADVERSARIAL. Is this AI-generated description accurate or hallucinated?

Entity: {name} ({url})
Claimed: "{claimed_description}"

Website content:
{site}

Red flags: buzzwords NOT on the website, generic text fitting any company, wrong entity.

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "hallucination_risk": "none"/"low"/"medium"/"high", "evidence": "max 60 words"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "hallucination_risk": str(raw.get("hallucination_risk", "medium")),
                "evidence": str(raw.get("evidence", ""))[:100],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["hallucination_risk"] != leader["hallucination_risk"]:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{node_id}:description", result)

    # =====================================================================
    # 3. VERIFY SECTOR
    # =====================================================================

    @gl.public.write
    def verify_sector(self, map_id: str, node_id: str, name: str, url: str, claimed_sector: str, claimed_category: str) -> str:

        def leader_fn():
            site = render_page(url)

            raw = _ask_llm(f"""Is {name}'s CORE business in the "{claimed_sector}" sector?

Category claimed: {claimed_category}

Website ({url}):
{site}

BE SKEPTICAL. A tech company with a sustainability page is NOT "green/environmental".
Only confirm if the entity's primary business is in the claimed sector.

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "evidence": "max 60 words", "suggested_sector": null or "correct sector if wrong"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "suggested_sector": raw.get("suggested_sector"),
                "evidence": str(raw.get("evidence", ""))[:100],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["suggested_sector"] and leader["suggested_sector"]:
                if mine["suggested_sector"].lower() != leader["suggested_sector"].lower():
                    return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{node_id}:sector", result)

    # =====================================================================
    # 4. VERIFY RECENCY
    # =====================================================================

    @gl.public.write
    def verify_recency(self, map_id: str, node_id: str, name: str, url: str, country: str) -> str:

        def leader_fn():
            site = render_page(url)

            raw = _ask_llm(f"""Is {name} still active and operating in {country}?

Website ({url}):
{site}

Look for: copyright year, recent blog posts, event announcements, job postings,
social media links with recent activity, any dates from 2025-2026.
Signs of abandonment: broken pages, outdated copyright, no recent content.

Return JSON: {{"verified": bool, "confidence": "high"/"medium"/"low", "last_activity_evidence": "what evidence found", "geography_confirmed": bool}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "geography_confirmed": _coerce_bool(raw.get("geography_confirmed", True)),
                "last_activity_evidence": str(raw.get("last_activity_evidence", ""))[:100],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["geography_confirmed"] != leader["geography_confirmed"]:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{node_id}:recency", result)

    # =====================================================================
    # 5. VERIFY SOCIAL — Run BEFORE funding & relationship
    # =====================================================================

    @gl.public.write
    def verify_social(self, map_id: str, node_id: str, name: str, platform: str, social_url: str, claimed_followers: str) -> str:

        def leader_fn():
            content = render_page(social_url)
            if not content:
                raise gl.vm.UserError(f"{ERROR_EXTERNAL} Social profile unavailable: {social_url}")

            raw = _ask_llm(f"""Verify this {platform} profile for {name}.

Profile URL: {social_url}
Claimed followers: {claimed_followers}

Profile page content:
{content}

Check: Is this a real {platform} profile? Does it belong to "{name}"?
Is it authentic (not impersonator)? Follower count match? Recent activity?

Return JSON: {{"verified": bool, "belongs_to_entity": bool, "is_authentic": bool, "estimated_followers": "count", "follower_match": bool, "activity_level": "active"/"dormant"/"dead", "confidence": "high"/"medium"/"low"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "belongs_to_entity": _coerce_bool(raw.get("belongs_to_entity")),
                "is_authentic": _coerce_bool(raw.get("is_authentic")),
                "estimated_followers": str(raw.get("estimated_followers", "unknown")),
                "follower_match": _coerce_bool(raw.get("follower_match", True)),
                "activity_level": str(raw.get("activity_level", "unknown")),
                "confidence": _coerce_confidence(raw.get("confidence")),
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["belongs_to_entity"] != leader["belongs_to_entity"]:
                return False
            if mine["is_authentic"] != leader["is_authentic"]:
                return False
            if mine["activity_level"] != leader["activity_level"]:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{node_id}:social:{platform}", result)

    # =====================================================================
    # 6. VERIFY FUNDING — Uses websites + social profiles
    # =====================================================================

    @gl.public.write
    def verify_funding(self, map_id: str, claim_id: str,
                       investor_name: str, investor_url: str,
                       company_name: str, company_url: str,
                       investor_social_url: str, company_social_url: str) -> str:

        def leader_fn():
            investor_site = render_page(investor_url)
            company_site = render_page(company_url)
            investor_social = render_page(investor_social_url) if investor_social_url else ""
            company_social = render_page(company_social_url) if company_social_url else ""

            raw = _ask_llm(f"""Verify: "{investor_name}" funds/invested in "{company_name}".

=== Investor website ({investor_url}) ===
{investor_site}

=== Company website ({company_url}) ===
{company_site}

=== Investor social profile ({investor_social_url}) ===
{investor_social}

=== Company social profile ({company_social_url}) ===
{company_social}

Check ALL sources — websites AND social media posts:
1. Does investor's website/portfolio list this company?
2. Does company's website mention this investor as backer?
3. Do social media posts announce this investment/funding?

IMPORTANT: If ANY first-party source confirms (investor's own site lists the company,
OR company's own site lists the investor) → that's high confidence.
Websites and official social accounts don't lie about their own investments.

Return JSON: {{"verified": bool, "investor_lists_company": bool, "company_lists_investor": bool, "social_confirms": bool, "confidence": "high"/"medium"/"low", "evidence": "max 80 words"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "investor_lists_company": _coerce_bool(raw.get("investor_lists_company")),
                "company_lists_investor": _coerce_bool(raw.get("company_lists_investor")),
                "social_confirms": _coerce_bool(raw.get("social_confirms", False)),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "evidence": str(raw.get("evidence", ""))[:120],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["investor_lists_company"] != leader["investor_lists_company"]:
                return False
            if mine["company_lists_investor"] != leader["company_lists_investor"]:
                return False
            if mine["social_confirms"] != leader["social_confirms"]:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{claim_id}:funding", result)

    # =====================================================================
    # 7. VERIFY RELATIONSHIP — Uses websites + social profiles
    # =====================================================================

    @gl.public.write
    def verify_relationship(self, map_id: str, edge_id: str,
                            entity_a: str, url_a: str,
                            entity_b: str, url_b: str,
                            claimed_type: str,
                            social_a_url: str, social_b_url: str) -> str:

        def leader_fn():
            site_a = render_page(url_a)
            site_b = render_page(url_b)
            social_a = render_page(social_a_url) if social_a_url else ""
            social_b = render_page(social_b_url) if social_b_url else ""

            raw = _ask_llm(f"""Verify: {entity_a} has a "{claimed_type}" relationship with {entity_b}.

Types: "funds" (A invests in B), "partners_with" (allies), "client_of" (B uses A's services),
"portfolio" (B in A's accelerator), "sponsors" (A sponsors B), "competes_with" (competitors)

=== {entity_a} website ({url_a}) ===
{site_a}

=== {entity_b} website ({url_b}) ===
{site_b}

=== {entity_a} social ({social_a_url}) ===
{social_a}

=== {entity_b} social ({social_b_url}) ===
{social_b}

Check websites AND social posts for evidence of this relationship.
CONFLICT DETECTION: Does A mention B? Does B mention A? One-sided = flag it.
Is the relationship TYPE correct? "partner" vs "client" vs "sponsor" matters.

Return JSON: {{"verified": bool, "type_accurate": bool, "suggested_type": "the correct type", "a_mentions_b": bool, "b_mentions_a": bool, "social_confirms": bool, "conflict_detected": null or "describe", "confidence": "high"/"medium"/"low", "evidence": "max 80 words"}}""")

            return {
                "verified": _coerce_bool(raw.get("verified")),
                "type_accurate": _coerce_bool(raw.get("type_accurate")),
                "suggested_type": str(raw.get("suggested_type", claimed_type)),
                "a_mentions_b": _coerce_bool(raw.get("a_mentions_b")),
                "b_mentions_a": _coerce_bool(raw.get("b_mentions_a")),
                "social_confirms": _coerce_bool(raw.get("social_confirms", False)),
                "conflict_detected": raw.get("conflict_detected"),
                "confidence": _coerce_confidence(raw.get("confidence")),
                "evidence": str(raw.get("evidence", ""))[:120],
            }

        def validator_fn(leaders_res) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            leader = leaders_res.calldata
            if mine["verified"] != leader["verified"]:
                return False
            if mine["type_accurate"] != leader["type_accurate"]:
                return False
            if mine["suggested_type"] != leader["suggested_type"]:
                return False
            if mine["a_mentions_b"] != leader["a_mentions_b"]:
                return False
            if mine["b_mentions_a"] != leader["b_mentions_a"]:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return self._store(f"{map_id}:{edge_id}:relationship", result)

    # =====================================================================
    # READ METHODS
    # =====================================================================

    @gl.public.view
    def get_claim(self, map_id: str, claim_key: str) -> str:
        key = f"{map_id}:{claim_key}"
        if key in self.claim_results:
            return self.claim_results[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_node_verification(self, map_id: str, node_id: str) -> str:
        results = {}
        for suffix in ["existence", "description", "sector", "recency"]:
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
