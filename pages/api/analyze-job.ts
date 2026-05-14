import type { NextApiRequest, NextApiResponse } from 'next';
import { callAI, extractJSON, AIProvider } from '../../lib/ai-providers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company, title, applyUrl, jobDescUrl, careersUrl, candidateProfile, jdText, apiKeyOverride, aiProvider } = req.body;
  const provider: AIProvider = aiProvider || 'claude';
  const envKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  const apiKey = apiKeyOverride || envKey;

  if (!apiKey) return res.status(400).json({ error: 'No API key configured. Add it in Settings.' });

  let jobContent = jdText || '';
  if (!jobContent && (jobDescUrl || applyUrl)) {
    const urlToTry = jobDescUrl || applyUrl;
    try {
      const fetchRes = await fetch(urlToTry, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobBoardBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (fetchRes.ok) {
        const html = await fetchRes.text();
        jobContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
      }
    } catch { jobContent = ''; }
  }

  const profileStr = candidateProfile ? JSON.stringify(candidateProfile) : '{}';
  const hasContent = jobContent.length > 100;

  const systemPrompt = `You are a recruiter analyst. Generate a complete job card analysis for the role described.
The candidate profile is: ${profileStr}

Return ONLY a valid JSON object with exactly these fields — no markdown, no explanation:
{
  "category": "senior-director|director|manager",
  "isRemote": true,
  "isHybrid": false,
  "isOnsite": false,
  "location": "City, ST or empty string for remote",
  "industry": ["ecom|saas|fintech|health|nonprofit|proptech"],
  "salaryMin": 120000,
  "salaryMax": 180000,
  "salaryDisplay": "$120K–$180K",
  "salaryNote": "Estimated",
  "rating": 7,
  "roleSummary": "2-3 sentence summary",
  "whyYouFit": ["bullet 1", "bullet 2", "bullet 3"],
  "requirements": ["req 1", "req 2", "req 3"],
  "companyInfo": "2-3 sentences about company",
  "goldFlags": ["positive signal"],
  "redFlags": ["concern"]
}

Rating: 9-10 near-perfect, 7-8 strong, 5-6 solid, below 5 = rate as 5.
Return ONLY the JSON object. No markdown. No explanation.`;

  try {
    const aiResponse = await callAI(
      provider,
      apiKey,
      [{
        role: 'user',
        content: `Company: ${company}\nJob Title: ${title}\nApply URL: ${applyUrl||'N/A'}\nJob Description URL: ${jobDescUrl||'N/A'}\nCareers URL: ${careersUrl||'N/A'}\n\n${hasContent ? `Job Content:\n${jobContent}` : 'No job description — generate from company name and title only.'}`,
      }],
      systemPrompt,
      4000
    );

    if (aiResponse.error) {
      return res.status(500).json({ error: `AI error: ${aiResponse.error}` });
    }

    const jsonStr = extractJSON(aiResponse.text);
    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse analysis response.' });
    }

    return res.status(200).json({ analysis, urlFetchSuccess: hasContent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
