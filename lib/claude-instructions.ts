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
// IMPORTANT: This system prompt is used both for plain-text extraction AND
// for forced tool_use extraction. The hard anti-hallucination rules below
// are critical to prevent URL fabrication, which was a recurring bug.
export function getClaudeExtractProfilePrompt(): string {
  return `You are a precise resume parser. Your sole task is to extract structured profile data from the resume text provided by the user.

ABSOLUTE RULES (violating any of these is a critical failure):
1. EXTRACT-ONLY: Only output values that are LITERALLY PRESENT in the resume text. Never infer, guess, normalize, or invent any value — especially URLs, emails, phone numbers, employer names, or job titles.
2. URL VERBATIM RULE: For ANY URL field (linkedinUrl, portfolioUrl, additionalLinks), the URL MUST appear character-for-character in the resume text. If you cannot point to the exact substring in the resume, return an empty string "". Do NOT guess URLs from a candidate's name (e.g. do not assume "linkedin.com/in/firstname-lastname"). Do NOT construct URLs from company names. Do NOT autocomplete partial URLs.
3. URL NORMALIZATION (allowed only AFTER verbatim presence is confirmed): strip leading "https://" and "www." prefixes. Preserve the rest exactly. Do not add or remove trailing slashes, paths, or query strings.
4. EMAIL & PHONE: Must appear verbatim in the resume. Do not invent format.
5. EMPTY > WRONG: When a field is not present, ALWAYS prefer empty string "" or empty array [] over a guess. There is no penalty for empty fields; there is severe penalty for fabricated fields.

DERIVATION RULES (these fields may be derived, not literally quoted):
- yearsExperience: calculate from earliest dated role to most recent role. Return as numeric string (e.g. "12"). Use "" if dates unclear.
- targetTitles: derive from the candidate's most recent role title. Include the current-level title plus 3–5 logical next-step senior titles (e.g. if "Senior Product Designer", include "Senior Product Designer", "Staff Product Designer", "Principal Product Designer", "Design Manager", "Director of Product Design"). Base titles strictly on the candidate's actual discipline as evidenced by the resume.
- targetSectors: list industries the candidate has explicitly worked in based on listed employers.
- coreStrengths and discipline: short phrases summarizing what is explicitly demonstrated in the resume.
- salaryMin/salaryMax: 0 unless compensation is explicitly stated.

ADDITIONAL LINKS:
- additionalLinks should contain any non-LinkedIn, non-portfolio URLs found verbatim in the resume (e.g. GitHub, Behance, Dribbble, Medium, personal blog). Each item: {"title": "platform or short label", "url": "verbatim url with https:// and www. stripped"}.
- Do NOT include the same URL that is already in linkedinUrl or portfolioUrl.
- If no additional URLs are present in the resume, return an empty array [].

Return ONLY this exact JSON object — no markdown fences, no explanation, no preamble:
{
  "name": "",
  "email": "",
  "phone": "",
  "linkedinUrl": "",
  "portfolioUrl": "",
  "additionalLinks": [],
  "mostRecentRole": "",
  "mostRecentEmployer": "",
  "yearsExperience": "",
  "coreStrengths": "",
  "discipline": "",
  "targetTitles": [],
  "targetSectors": [],
  "salaryMin": 0,
  "salaryMax": 0
}`;
}

// ── Profile Extractor — Tool Schema (forced tool_use mode) ──
// Use with tool_choice: {type: "tool", name: "extract_profile"} for
// schema-constrained extraction. This is more reliable than JSON-in-prose
// because the input_schema acts as a hard grammar constraint at decode time.
export const CLAUDE_EXTRACT_PROFILE_TOOL = {
  name: 'extract_profile',
  description: 'Records candidate profile data extracted from a resume. All URL fields MUST appear verbatim in the resume — never invent or guess URLs from names or companies. Empty string is the correct value when a field is not present.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Candidate full name as it appears in the resume.' },
      email: { type: 'string', description: 'Email address copied verbatim from the resume. Empty string if not present.' },
      phone: { type: 'string', description: 'Phone number copied verbatim from the resume. Empty string if not present.' },
      linkedinUrl: { type: 'string', description: 'LinkedIn URL that appears verbatim in the resume, with https:// and www. stripped. Empty string if no LinkedIn URL appears in the resume. Do not guess from the candidate name.' },
      portfolioUrl: { type: 'string', description: 'Portfolio or personal website URL that appears verbatim in the resume, with https:// and www. stripped. Empty string if not present. Do not guess from the candidate name or employer.' },
      additionalLinks: {
        type: 'array',
        description: 'Other URLs (GitHub, Behance, Dribbble, blog, etc.) that appear verbatim in the resume. Do not duplicate linkedinUrl or portfolioUrl.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short platform label, e.g. "GitHub", "Behance", "Medium".' },
            url: { type: 'string', description: 'Verbatim URL from the resume with https:// and www. stripped.' }
          },
          required: ['title', 'url']
        }
      },
      mostRecentRole: { type: 'string', description: 'Most recent job title from the resume.' },
      mostRecentEmployer: { type: 'string', description: 'Most recent employer name from the resume.' },
      yearsExperience: { type: 'string', description: 'Numeric string of total years between earliest and most recent role, e.g. "12". Empty string if dates unclear.' },
      coreStrengths: { type: 'string', description: 'Short phrase summarizing the candidate\'s core strengths as evidenced by the resume.' },
      discipline: { type: 'string', description: 'Primary discipline or field (e.g. "Product Design", "Software Engineering").' },
      targetTitles: {
        type: 'array',
        description: '3-5 logical job titles to target — the candidate\'s current-level title plus next-step senior titles in the same discipline.',
        items: { type: 'string' }
      },
      targetSectors: {
        type: 'array',
        description: 'Industries the candidate has explicitly worked in, derived from listed employers.',
        items: { type: 'string' }
      },
      salaryMin: { type: 'number', description: 'Minimum salary if explicitly stated in the resume, else 0.' },
      salaryMax: { type: 'number', description: 'Maximum salary if explicitly stated in the resume, else 0.' }
    },
    required: ['name', 'email', 'linkedinUrl', 'portfolioUrl', 'additionalLinks', 'mostRecentRole', 'mostRecentEmployer', 'yearsExperience', 'coreStrengths', 'discipline', 'targetTitles', 'targetSectors', 'salaryMin', 'salaryMax', 'phone']
  }
};

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
