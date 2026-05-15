// ============================================================
// GEMINI SYSTEM PROMPTS
// Authored for Gemini 2.5 Flash's processing characteristics:
// - Performs best with direct, unambiguous task framing
// - Requires explicit JSON schema — responds poorly to prose-described schemas
// - Needs clear separation between instruction and data
// - Benefits from positive framing (what TO do) over negative (what NOT to do)
// - systemInstruction field used natively via ai-providers.ts callGeminiAPI
// - Compact prompts reduce RPD usage on free tier
// ============================================================

// ── Pass 2: Job Card Builder ─────────────────────────────────
export function getGeminiSearchPrompt(
  userInstructions: string,
  specialInstructions: string | null,
  titlesSearched: string[],
  today: string
): string {
  const special = specialInstructions
    ? `\nSPECIAL INSTRUCTIONS: ${specialInstructions}`
    : '';

  return `${userInstructions}${special}

DATE: ${today}
TITLES: ${titlesSearched.join(', ') || 'see instructions above'}

TASK: Convert job search results into structured job card objects.

INPUT FORMAT: Each result is prefixed [ATS], [AGG-V], or [AGG-U] followed by Company|Title|URL|Snippet.

EVALUATION STEPS:
1. Confirm the result is an active job posting (not a news article, press release, or generic careers page)
2. Confirm the title matches or closely variants the TITLES listed above
3. Confirm seniority is appropriate — exclude clearly junior or executive-level mismatches
4. Assign a rating: 9-10 (near-perfect match), 7-8 (strong with one gap), 5-6 (solid with gaps), below 5 (exclude)

OUTPUT: A single JSON array. No text before or after. No markdown.

Schema for each PASSING job:
{"id":"company-title-slug","company":"string","title":"string","category":"director|senior-director|manager|vp","isRemote":true,"isHybrid":false,"isOnsite":false,"location":"City ST or empty","industry":["sector"],"salaryMin":0,"salaryMax":0,"salaryDisplay":"$0 — Not Listed","salaryNote":"Not Listed","rating":7,"auditLabel":"✓ Direct ATS Verified ${today}","roleSummary":"2-3 sentence role description","whyYouFit":["fit point 1","fit point 2","fit point 3"],"requirements":["req 1","req 2","req 3"],"companyInfo":"2-3 sentence company description","goldFlags":["positive signal"],"redFlags":["concern"],"applyUrl":"url","careersUrl":"url","aboutUrl":"url","jobDescUrl":"url","postedDate":"YYYY-MM-DD","excluded":false}

auditLabel values: "✓ Direct ATS Verified ${today}" for [ATS] | "✓ Company Domain Verified ${today}" for [AGG-V] | "✓ Aggregator Listed ${today}" for [AGG-U]

Schema for each EXCLUDED job:
{"id":"company-title-slug","company":"string","title":"string","layerFailed":"Layer 1|Layer 2|Layer 3","reason":"specific reason","excluded":true}

Output the JSON array only.`;
}

// ── Profile Extractor ────────────────────────────────────────
export function getGeminiExtractProfilePrompt(): string {
  return `TASK: Extract structured profile data from resume text.

Rules:
- Use only information explicitly present in the resume
- Missing fields: use "" for strings, [] for arrays, 0 for numbers
- targetTitles: candidate's current role title plus 3-5 logical senior next-step titles
- linkedinUrl / portfolioUrl: remove https:// and www. prefixes
- yearsExperience: total years from first to most recent role, as a number string

Output this JSON object only — no markdown, no explanation:
{"name":"","email":"","phone":"","linkedinUrl":"","portfolioUrl":"","additionalLinks":[{"title":"","url":""}],"mostRecentRole":"","mostRecentEmployer":"","yearsExperience":"","coreStrengths":"","discipline":"","targetTitles":[],"targetSectors":[],"salaryMin":0,"salaryMax":0,"additionalUrlsFound":[]}`;
}

// ── Job Analyzer ─────────────────────────────────────────────
export function getGeminiAnalyzeJobPrompt(profileStr: string): string {
  return `TASK: Analyze a job opportunity against a candidate profile and return a structured job card.

Candidate profile: ${profileStr}

Rating: 9-10 near-perfect alignment | 7-8 strong with one gap | 5-6 solid with multiple gaps | minimum rating is 5

Output this JSON object only — no markdown, no explanation:
{"category":"director|senior-director|manager|vp|ic","isRemote":false,"isHybrid":false,"isOnsite":false,"location":"City ST or empty","industry":["sector"],"salaryMin":0,"salaryMax":0,"salaryDisplay":"$0 — Not Listed","salaryNote":"Not Listed","rating":7,"roleSummary":"2-3 sentences about role scope","whyYouFit":["specific fit point 1","specific fit point 2","specific fit point 3"],"requirements":["requirement 1","requirement 2","requirement 3"],"companyInfo":"2-3 sentences about company","goldFlags":["positive signal"],"redFlags":["concern"]}`;
}

// ── Document Generator ───────────────────────────────────────
export function getGeminiGeneratePrompt(
  type: 'resume' | 'coverLetter',
  userInstructions: string
): string {
  return `${userInstructions}

TASK: Generate a tailored ${type === 'resume' ? 'resume' : 'cover letter'} by updating the text content of the provided HTML template.

Rules:
1. Output the complete HTML document and nothing else
2. Do not add markdown code fences or any text outside the HTML
3. Keep all HTML elements, CSS classes, styles, and inline SVG exactly as-is
4. Change text content only — do not restructure, add, or remove elements
5. Output the full document from opening to closing tag — do not truncate
6. Tailor content specifically to the company and role described`;
}
