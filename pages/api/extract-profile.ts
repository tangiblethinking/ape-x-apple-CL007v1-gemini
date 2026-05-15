import type { NextApiRequest, NextApiResponse } from 'next';
import { callAI, extractJSON, AIProvider } from '../../lib/ai-providers';
import { getClaudeExtractProfilePrompt } from '../../lib/claude-instructions';
import { getGeminiExtractProfilePrompt } from '../../lib/gemini-instructions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, apiKeyOverride, aiProvider } = req.body;
  const provider: AIProvider = aiProvider || 'claude';
  const envKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  const apiKey = apiKeyOverride || envKey;

  if (!apiKey) return res.status(400).json({ error: 'No API key configured.' });
  if (!resumeText) return res.status(400).json({ error: 'No resume text provided.' });

  const systemPrompt = provider === 'gemini'
    ? getGeminiExtractProfilePrompt()
    : getClaudeExtractProfilePrompt();

  try {
    const aiResponse = await callAI(
      provider,
      apiKey,
      [{ role: 'user', content: `Extract profile data from this resume:\n\n${resumeText.slice(0, 10000)}` }],
      systemPrompt,
      2000
    );

    if (aiResponse.error) {
      return res.status(500).json({ error: `AI extraction failed: ${aiResponse.error}` });
    }

    // Use robust JSON extractor — handles markdown fences, prose wrapping, etc.
    const jsonStr = extractJSON(aiResponse.text);

    let profile;
    try {
      profile = JSON.parse(jsonStr);
    } catch {
      // Return the raw text so the client can at least see what came back
      return res.status(500).json({
        error: 'Could not parse AI response as JSON. Try again.',
        rawResponse: aiResponse.text.slice(0, 500),
      });
    }

    return res.status(200).json({ profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
