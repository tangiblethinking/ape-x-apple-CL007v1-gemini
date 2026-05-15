// ============================================================
// CLAUDE SYSTEM PROMPTS
// Authored for Claude's instruction-following strengths:
// - Handles long, layered, nuanced instructions reliably
// - Responds well to explicit rules and nested conditions
// - Accurately self-audits and applies multi-step reasoning
// - Reliably returns clean JSON when explicitly instructed
// ============================================================

// ── Pass 2: Job Card Builder ─────────────────────────────────
export function getClaudeSearchPrompt(
  userInstructions: string,
  specialInstructions: string | null,
  titlesSearched: string[],
  today: string
): string {
  const special = specialInstructions
    ? `\n\nSPECIAL OVERRIDE INSTRUCTIONS FOR THIS SEARCH:\n━━━━━━━━━━━━━━━━━━━━\n${specialInstructions}\n━━━━━━━━━━━━━━━━━━━━`
    : '';

  return `${userInstructions}${special}

TODAY: ${today}
TARGET TITLES SEARCHED: ${titlesSearched.join(', ') || 'see instructions'}

You are processing verified job search results. Your task is to evaluate each result and return a structured JSON array of job cards.

CLASSIFICATION RULES:
- [ATS] prefix = direct ATS link (Greenhouse, Lever, Workday, Ashby) — highest confidence
- [AGG-V] prefix = aggregator result with verified company URL — medium confidence
- [AGG-U] prefix = aggregator result, unverified — include but flag

AUDIT PROTOCOL — apply all three layers:
Layer 1: Is this a real, active job posting? Exclude press releases, old listings, generic career pages.
Layer 2: Does the title match or closely variant the TARGET TITLES? Exclude mismatches.
Layer 3: Does the seniority match? Exclude roles that are clearly too junior or too senior based on title.

RATING SCALE:
- 9–10: Near-perfect title + seniority + known company + direct ATS link
- 7–8: Strong match with one gap (e.g. aggregator listed, slight title variant)
- 5–6: Solid fundamentals, meaningful gaps (e.g. unverified URL, indirect title)
- Below 5: Exclude entirely — return as excluded object

REQUIRED OUTPUT FORMAT — return ONLY a valid JSON array, no markdown, no explanation, no preamble:

Active job object (one per passing result):
{
  "id": "company-title-slug",
  "company": "Company Name",
  "title": "Exact Job Title",
  "category": "seniority level from title e.g. director / senior-director / manager / vp",
  "isRemote": true,
  "isHybrid": false,
  "isOnsite": false,
  "location": "City, ST — only for hybrid/onsite. Empty string for remote.",
  "industry": ["primary sector e.g. saas / fintech / ecom / health / nonprofit"],
  "salaryMin": 0,
  "salaryMax": 0,
  "salaryDisplay": "$0 — Not Listed",
  "salaryNote": "Not Listed",
  "rating": 7,
  "auditLabel": "✓ Direct ATS Verified ${today} OR ✓ Company Domain Verified ${today} OR ✓ Aggregator Listed ${today}",
  "roleSummary": "2–3 sentences describing the role scope and what makes it notable.",
  "whyYouFit": ["Specific reason 1", "Specific reason 2", "Specific reason 3"],
  "requirements": ["Key requirement 1", "Key requirement 2", "Key requirement 3"],
  "companyInfo": "2–3 sentences about the company — stage, size, sector, notable facts.",
  "goldFlags": ["Strong positive signal about this role or company"],
  "redFlags": ["Genuine concern or risk about this role"],
  "applyUrl": "direct application URL",
  "careersUrl": "company careers page URL",
  "aboutUrl": "company about/home page URL",
  "jobDescUrl": "job description URL",
  "postedDate": "YYYY-MM-DD or empty string",
  "excluded": false
}

Excluded job object (for anything failing audit):
{
  "id": "company-title-slug",
  "company": "Company Name",
  "title": "Job Title",
  "layerFailed": "Layer 1 / Layer 2 / Layer 3",
  "reason": "Specific reason for exclusion",
  "excluded": true
}

CRITICAL: Return ONLY the JSON array. Start with [ and end with ]. No explanation before or after.`;
}

// ── Profile Extractor ────────────────────────────────────────
export function getClaudeExtractProfilePrompt(): string {
  return `You are a precise resume parser. Your sole task is to extract structured profile data from resume text.

Rules:
- Extract only what is explicitly present in the resume text — do not infer or fabricate
- For fields not found, use empty string "" or empty array []
- salaryMin and salaryMax: set to 0 unless compensation is explicitly stated
- targetTitles: derive from the candidate's most recent role — include current level title plus 3–5 logical next-step senior titles
- linkedinUrl and portfolioUrl: strip https:// and www. prefixes
- yearsExperience: calculate from earliest to most recent role as a numeric string

Return ONLY this exact JSON object — no markdown fences, no explanation, no preamble:
{
  "name": "",
  "email": "",
  "phone": "",
  "linkedinUrl": "",
  "portfolioUrl": "",
  "additionalLinks": [{"title": "", "url": ""}],
  "mostRecentRole": "",
  "mostRecentEmployer": "",
  "yearsExperience": "",
  "coreStrengths": "",
  "discipline": "",
  "targetTitles": [],
  "targetSectors": [],
  "salaryMin": 0,
  "salaryMax": 0,
  "additionalUrlsFound": []
}`;
}

// ── Job Analyzer ─────────────────────────────────────────────
export function getClaudeAnalyzeJobPrompt(profileStr: string): string {
  return `You are a senior recruiter analyst evaluating a job opportunity against a candidate profile.

Candidate profile: ${profileStr}

Your task: Produce a complete job card analysis. Be specific — draw direct connections between the role requirements and the candidate's background. Do not be generic.

Rating guidance:
- 9–10: Near-perfect alignment — title, seniority, industry, skills all match
- 7–8: Strong match with one meaningful gap
- 5–6: Solid fundamentals, multiple gaps or uncertainty
- Below 5: Rate as 5 minimum — do not exclude here

Return ONLY this exact JSON object — no markdown, no explanation:
{
  "category": "director / senior-director / manager / vp / ic",
  "isRemote": false,
  "isHybrid": false,
  "isOnsite": false,
  "location": "City, ST or empty string for remote",
  "industry": ["primary sector"],
  "salaryMin": 0,
  "salaryMax": 0,
  "salaryDisplay": "$0 — Not Listed",
  "salaryNote": "Not Listed or Estimated or range source",
  "rating": 7,
  "roleSummary": "2–3 sentences describing scope, team, and what makes this role distinct.",
  "whyYouFit": ["Specific alignment point 1", "Specific alignment point 2", "Specific alignment point 3"],
  "requirements": ["Key stated or implied requirement 1", "Requirement 2", "Requirement 3"],
  "companyInfo": "2–3 sentences: company stage, size, sector, what they build or do.",
  "goldFlags": ["Concrete positive signal about this opportunity"],
  "redFlags": ["Concrete concern or risk worth noting"]
}`;
}

// ── Document Generator ───────────────────────────────────────
export function getClaudeGeneratePrompt(
  type: 'resume' | 'coverLetter',
  userInstructions: string
): string {
  return `${userInstructions}

You are generating a tailored ${type === 'resume' ? 'resume' : 'cover letter'} as a complete HTML document.

STRICT OUTPUT RULES — violating any of these will break the application:
1. Return ONLY the complete HTML document — nothing before the opening tag, nothing after the closing tag
2. Do NOT wrap output in markdown code fences (\`\`\`html or \`\`\`)
3. Preserve 100% of the HTML structure, all CSS styles, all classes, all inline SVG elements
4. Modify TEXT CONTENT only — do not add, remove, or restructure any HTML elements
5. Do not truncate — the output must be the complete document from <!DOCTYPE> to </html>
6. The rendered output must be visually identical to the template in layout and style

Tailor the text content specifically to the job described. Make connections between the candidate's experience and the role's requirements explicit and specific.`;
}
