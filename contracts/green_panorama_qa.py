# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class GreenPanoramaQA(gl.Contract):
    verifications: TreeMap[str, str]
    relationship_verifications: TreeMap[str, str]
    social_verifications: TreeMap[str, str]
    verification_count: u256

    def __init__(self):
        self.verification_count = u256(0)

    @gl.public.write
    def verify_node(
        self,
        node_id: str,
        nombre: str,
        link: str,
        cluster: str,
        categoria: str,
        descripcion: str,
    ) -> str:
        """
        Verify that a node (company/institution) in the green panorama:
        1. Actually exists (website is real)
        2. Is related to Argentina (operates in, headquartered, or has significant presence)
        3. Operates in the green/carbon/environmental sector
        4. Has an accurate description

        Multiple validators independently verify using different LLMs.
        """

        def nondet() -> str:
            web_data = ""
            if link:
                try:
                    response = gl.nondet.web.get(link)
                    web_data = response.body.decode("utf-8")[:4000]
                except Exception:
                    web_data = "WEBSITE_UNAVAILABLE"

            task = f"""You are a fact-checker verifying data about a company/institution
in Argentina's green/carbon market ecosystem.

Company data to verify:
- Name: {nombre}
- Website: {link}
- Cluster: {cluster}
- Category: {categoria}
- Description: {descripcion}

Website content (first 4000 chars):
{web_data}

Verify the following and respond ONLY as valid JSON:
1. "exists": Does this company/institution actually exist based on the website content?
2. "argentina_related": Is it related to Argentina? (headquartered, operates in, or has
   significant presence/projects in Argentina. International orgs that work WITH Argentina count as true)
3. "green_sector": Is it genuinely part of the green/carbon/environmental/conservation/
   cleantech/sustainability sector?
4. "description_accurate": Is the provided description reasonably accurate based on website content?
5. "accuracy_score": Rate overall data accuracy as "high", "medium", or "low"
6. "reasoning": Brief explanation (max 100 words)

JSON format:
{{"exists": true, "argentina_related": true, "green_sector": true, "description_accurate": true, "accuracy_score": "high", "reasoning": "..."}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = json.loads(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.strict_eq(nondet)
        self.verifications[node_id] = result_str
        self.verification_count = u256(int(self.verification_count) + 1)
        return result_str

    @gl.public.write
    def verify_relationship(
        self,
        edge_id: str,
        node_a_name: str,
        node_a_link: str,
        node_b_name: str,
        node_b_link: str,
        relationship_type: str,
        relationship_description: str,
    ) -> str:
        """
        Verify that a claimed relationship between two nodes actually exists.
        Fetches both websites and uses LLM to find evidence of the relationship.
        """

        def nondet() -> str:
            web_data_a = ""
            web_data_b = ""

            if node_a_link:
                try:
                    response_a = gl.nondet.web.get(node_a_link)
                    web_data_a = response_a.body.decode("utf-8")[:3000]
                except Exception:
                    web_data_a = "WEBSITE_UNAVAILABLE"

            if node_b_link:
                try:
                    response_b = gl.nondet.web.get(node_b_link)
                    web_data_b = response_b.body.decode("utf-8")[:3000]
                except Exception:
                    web_data_b = "WEBSITE_UNAVAILABLE"

            task = f"""You are verifying a claimed relationship between two organizations
in Argentina's green/carbon market ecosystem.

Claimed relationship:
- Organization A: {node_a_name} ({node_a_link})
- Organization B: {node_b_name} ({node_b_link})
- Relationship type: {relationship_type}
- Description: {relationship_description}

Website A content (first 3000 chars):
{web_data_a}

Website B content (first 3000 chars):
{web_data_b}

Check if there is evidence on either website that this relationship exists.
Look for: partner logos, mentions, press releases, portfolio pages, funding announcements.

Respond ONLY as valid JSON:
{{"relationship_confirmed": true/false, "evidence_found_on": "website_a"/"website_b"/"both"/"neither", "confidence": "high"/"medium"/"low", "reasoning": "brief explanation"}}
"""
            result = gl.nondet.exec_prompt(task)
            parsed = json.loads(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.strict_eq(nondet)
        self.relationship_verifications[edge_id] = result_str
        return result_str

    @gl.public.write
    def verify_social(
        self,
        node_id: str,
        nombre: str,
        social_links: str,
        claimed_followers: str,
    ) -> str:
        """
        Full social media audit for a node:
        1. Verify each social link belongs to the company (not impersonator)
        2. Check account is real (not fake/bot)
        3. Compare claimed follower count to actual
        4. Assess activity level (active, dormant, dead)

        social_links: JSON array of URLs, e.g. ["https://instagram.com/company", ...]
        claimed_followers: JSON object, e.g. {"instagram": 5000, "linkedin": 2000}
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

            task = f"""You are auditing the social media presence of a company/institution
in Argentina's green/carbon market ecosystem.

Company: {nombre}
Claimed followers: {json.dumps(claimed)}

Social media profiles and their page content:
{links_context}

For EACH social media profile, verify:
1. "link_valid": Does the URL load a real social media profile?
2. "belongs_to_company": Does the profile name/bio match "{nombre}"?
3. "is_real_account": Is this a genuine account (not fake/impersonator)?
4. "estimated_followers": What follower count is visible on the page? (use format like "4.8K", "12.3K")
5. "follower_match": Does the estimated count roughly match the claimed count?
6. "activity_level": "active" (posted within 3 months), "dormant" (3-12 months), or "dead" (>12 months / no posts)
7. "last_post_estimate": "within_1_month", "within_3_months", "within_1_year", "over_1_year", "unknown"

Respond ONLY as valid JSON:
{{"platforms": {{"instagram": {{"link_valid": true, "belongs_to_company": true, "is_real_account": true, "estimated_followers": "4.8K", "follower_match": true, "activity_level": "active", "last_post_estimate": "within_1_month"}}}}, "overall_social_score": "high"/"medium"/"low", "reasoning": "brief explanation max 100 words"}}

Include an entry for each platform found in the URLs. Detect the platform from the URL
(instagram.com, linkedin.com, twitter.com/x.com, facebook.com, youtube.com, tiktok.com).
"""
            result = gl.nondet.exec_prompt(task)
            parsed = json.loads(result)
            return json.dumps(parsed, sort_keys=True)

        result_str = gl.eq_principle.strict_eq(nondet)
        self.social_verifications[node_id] = result_str
        return result_str

    @gl.public.view
    def get_social_verification(self, node_id: str) -> str:
        if node_id in self.social_verifications:
            return self.social_verifications[node_id]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_verification(self, node_id: str) -> str:
        if node_id in self.verifications:
            return self.verifications[node_id]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_relationship_verification(self, edge_id: str) -> str:
        if edge_id in self.relationship_verifications:
            return self.relationship_verifications[edge_id]
        return json.dumps({"error": "not_found"})

    @gl.public.view
    def get_stats(self) -> str:
        return json.dumps({"total_verifications": int(self.verification_count)})
