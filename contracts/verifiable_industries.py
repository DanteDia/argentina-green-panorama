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
    match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
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


class VerifiableIndustries(gl.Contract):
    """
    Generic intelligent contract for verifying entities in ANY industry.

    This is the core protocol for "Verifiable Industries" — a public good
    for transparent industry mapping. It verifies:
    1. Entity existence (website + LLM knowledge)
    2. Sector relevance (dynamic — green, aviation, fintech, etc.)
    3. Geographic relevance (dynamic — Argentina, Brazil, Global, etc.)
    4. Description accuracy
    5. Relationship existence and type (3-source: websites + web search)
    6. Social media presence audit

    Each industry map gets its own namespace via map_id, allowing
    multiple industry maps to share one contract deployment.
    """

    verifications: TreeMap[str, str]
    relationship_verifications: TreeMap[str, str]
    social_verifications: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    @gl.public.write
    def verify_node(
        self,
        map_id: str,
        node_id: str,
        name: str,
        link: str,
        sector: str,
        category: str,
        description: str,
        country: str,
    ) -> str:
        """
        Verify that an entity belongs to a specific industry sector.

        Args:
            map_id: Industry map identifier (e.g., "green-argentina", "aviation-latam")
            node_id: Unique node identifier
            name: Entity name
            link: Website URL
            sector: Industry sector (e.g., "Green/Carbon/Environmental", "Aviation", "Fintech")
            category: Subcategory within the sector
            description: Claimed description of the entity
            country: Geographic scope (e.g., "Argentina", "Brazil", "Global")
        """

        def nondet() -> str:
            web_data = ""
            if link:
                try:
                    response = gl.nondet.web.get(link)
                    web_data = response.body.decode("utf-8")[:4000]
                except Exception:
                    web_data = "WEBSITE_UNAVAILABLE"

            task = f"""You are a fact-checker verifying data about an entity
in the {sector} sector in {country}.

Entity data to verify:
- Name: {name}
- Website: {link}
- Sector: {sector}
- Category: {category}
- Description: {description}
- Country/Region: {country}

Website content:
{web_data}

IMPORTANT: If the website is unavailable or empty, use your general knowledge.
Only mark a field as false if you have evidence it's incorrect, not just because data is missing.

Verify the following and respond ONLY as valid JSON:
1. "exists": Does this entity actually exist? (check website or use general knowledge)
2. "sector_relevant": Is it genuinely part of the {sector} sector?
3. "description_accurate": Is the provided description reasonably accurate? (if no description, set true)
4. "geography_relevant": Is it related to {country}? (headquartered, operates in, or has
   significant presence/projects there. International orgs that work WITH {country} count as true)
5. "accuracy_score": Rate overall data accuracy as "high", "medium", or "low"
6. "reasoning": Brief explanation (max 100 words)

JSON format:
{{"exists": true, "sector_relevant": true, "description_accurate": true, "geography_relevant": true, "accuracy_score": "high", "reasoning": "..."}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_non_comparative(
            nondet,
            task=f"Verify if {name} is a real entity in the {sector} sector in {country}",
            criteria="The JSON must contain exists, sector_relevant, description_accurate, geography_relevant (all booleans), accuracy_score (high/medium/low), and reasoning (string). Boolean values should be factually correct.",
        )
        storage_key = f"{map_id}:{node_id}"
        self.verifications[storage_key] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    @gl.public.write
    def verify_relationship(
        self,
        map_id: str,
        edge_id: str,
        node_a_name: str,
        node_a_link: str,
        node_b_name: str,
        node_b_link: str,
        relationship_type: str,
        relationship_description: str,
        sector: str,
        country: str,
    ) -> str:
        """
        Verify a claimed relationship using a hybrid approach:
        1. Web evidence: company websites + DuckDuckGo search
        2. LLM training knowledge: what the model knows about these entities
        3. Cross-reference both sources for final verdict

        Confidence levels:
        - Web evidence + LLM knowledge agree → high confidence
        - Only LLM knowledge confirms → medium confidence
        - Neither confirms → relationship not confirmed
        """

        def nondet() -> str:
            # === PHASE 1: Gather web evidence ===
            web_data_a = ""
            web_data_b = ""
            web_search_data = ""

            if node_a_link:
                try:
                    response_a = gl.nondet.web.get(node_a_link)
                    web_data_a = response_a.body.decode("utf-8")[:2000]
                except Exception:
                    web_data_a = "WEBSITE_UNAVAILABLE"

            if node_b_link:
                try:
                    response_b = gl.nondet.web.get(node_b_link)
                    web_data_b = response_b.body.decode("utf-8")[:2000]
                except Exception:
                    web_data_b = "WEBSITE_UNAVAILABLE"

            # DuckDuckGo HTML is bot-friendly (Google blocks bots)
            try:
                import urllib.parse
                search_query = urllib.parse.quote(f"{node_a_name} {node_b_name}")
                search_url = f"https://html.duckduckgo.com/html/?q={search_query}"
                search_response = gl.nondet.web.get(search_url)
                web_search_data = search_response.body.decode("utf-8")[:2500]
            except Exception:
                web_search_data = "SEARCH_UNAVAILABLE"

            # === PHASE 2: Cross-reference web evidence + LLM knowledge ===
            task = f"""You are verifying a claimed relationship between two entities
in the {sector} sector in {country}.

Claimed relationship:
- Entity A: {node_a_name} ({node_a_link})
- Entity B: {node_b_name} ({node_b_link})
- Claimed type: {relationship_type}
- Description: {relationship_description}

=== WEB EVIDENCE (gathered from live websites and search) ===

Website A content:
{web_data_a}

Website B content:
{web_data_b}

DuckDuckGo search results for "{node_a_name} {node_b_name}":
{web_search_data}

=== YOUR TASK ===

Use BOTH the web evidence above AND your own training knowledge to determine:

1. Does a relationship between {node_a_name} and {node_b_name} exist?
   - Check the web evidence for mentions, logos, press releases, news articles
   - Also consider what you know from your training data about these entities
   - If you know from training data that they have a relationship but web evidence
     doesn't show it, that's still valid (medium confidence)

2. What TYPE of relationship is it? Choose the most accurate:
   - "funds": A provides money/investment to B
   - "partners_with": A and B collaborate as allies/partners
   - "client_of": B is a client/customer of A (A provides services to B)
   - "portfolio": B is in A's accelerator/portfolio program
   - "regulates": A has regulatory authority over B

3. Is the claimed type "{relationship_type}" accurate?

CONFIDENCE RULES:
- Web evidence + your knowledge agree → "high"
- Only your knowledge confirms (no web evidence) → "medium"
- Only web evidence confirms (you don't know about it) → "medium"
- Neither confirms → "low" and relationship_confirmed should be false

Respond ONLY as valid JSON:
{{"relationship_confirmed": true/false, "type_accurate": true/false, "suggested_type": "funds"/"partners_with"/"client_of"/"portfolio"/"regulates", "evidence_found_on": "website_a"/"website_b"/"web_search"/"llm_knowledge"/"multiple"/"none", "confidence": "high"/"medium"/"low", "reasoning": "Explain what evidence you found (web or training knowledge). Be specific about sources."}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_non_comparative(
            nondet,
            task=f"Verify the {relationship_type} relationship between {node_a_name} and {node_b_name} in the {sector} sector",
            criteria="The JSON must contain relationship_confirmed (boolean), type_accurate (boolean), suggested_type (string), evidence_found_on (string), confidence (high/medium/low), and reasoning (string). The reasoning should reference specific evidence sources. Values should be factually correct.",
        )
        storage_key = f"{map_id}:{edge_id}"
        self.relationship_verifications[storage_key] = result_str
        return result_str

    @gl.public.write
    def verify_social(
        self,
        map_id: str,
        node_id: str,
        name: str,
        social_links: str,
        claimed_followers: str,
    ) -> str:
        """
        Full social media audit for an entity.
        Verifies each social profile is real, belongs to the entity,
        and has accurate follower counts.
        """

        def nondet() -> str:
            links = json.loads(social_links)
            claimed = json.loads(claimed_followers)

            social_data = {}
            for url in links:
                try:
                    response = gl.nondet.web.get(url)
                    social_data[url] = response.body.decode("utf-8")[:3000]
                except Exception:
                    social_data[url] = "PAGE_UNAVAILABLE"

            links_context = ""
            for url, content in social_data.items():
                links_context += f"\n--- Social Profile: {url} ---\n{content}\n"

            task = f"""You are auditing the social media presence of an entity.

Entity: {name}
Claimed followers: {json.dumps(claimed)}

Social media profiles and their page content:
{links_context}

For EACH social media profile, verify:
1. "link_valid": Does the URL load a real social media profile?
2. "belongs_to_entity": Does the profile name/bio match "{name}"?
3. "is_real_account": Is this a genuine account (not fake/impersonator)?
4. "estimated_followers": What follower count is visible? (format: "4.8K", "12.3K")
5. "follower_match": Does the estimated count roughly match the claimed count?
6. "activity_level": "active" (posted within 3 months), "dormant" (3-12 months), or "dead" (>12 months)
7. "last_post_estimate": "within_1_month", "within_3_months", "within_1_year", "over_1_year", "unknown"

Respond ONLY as valid JSON:
{{"platforms": {{"instagram": {{"link_valid": true, "belongs_to_entity": true, "is_real_account": true, "estimated_followers": "4.8K", "follower_match": true, "activity_level": "active", "last_post_estimate": "within_1_month"}}}}, "overall_social_score": "high"/"medium"/"low", "reasoning": "brief explanation max 100 words"}}

Include an entry for each platform found in the URLs.
"""
            result = gl.nondet.exec_prompt(task)
            parsed = extract_json(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.prompt_non_comparative(
            nondet,
            task=f"Audit social media presence of {name}",
            criteria="The JSON must contain platforms (object with per-platform data), overall_social_score (high/medium/low), and reasoning (string). Platform data should be factually accurate.",
        )
        storage_key = f"{map_id}:{node_id}"
        self.social_verifications[storage_key] = result_str
        return result_str

    # === Read Methods ===

    @gl.public.view
    def get_verification(self, map_id: str, node_id: str) -> str:
        key = f"{map_id}:{node_id}"
        if key in self.verifications:
            return self.verifications[key]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_relationship_verification(self, map_id: str, edge_id: str) -> str:
        key = f"{map_id}:{edge_id}"
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
