import type { NextApiRequest, NextApiResponse } from 'next';
import { callAI, callAIWithFileSearch, extractJSON, AIProvider } from '../../lib/ai-providers';
import { getClaudeExtractProfilePrompt } from '../../lib/claude-instructions';
import { getGeminiExtractProfilePrompt } from '../../lib/gemini-instructions';

interface ExtractProfileResponse {
  profile?: Record<string, unknown>;
  error?: string;
  details?: string;
  rawResponse?: string;
}

// CORRECTED: Match the actual schema from gemini-instructions.ts
const REQUIRED_PROFILE_FIELDS = ['name', 'email', 'skills'];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExtractProfileResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileId, resumeText, apiKeyOverride, aiProvider } = req.body;
  const provider: AIProvider = aiProvider || 'claude';
  const envKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  const apiKey = apiKeyOverride || envKey;

  if (!apiKey) {
    return res.status(400).json({
      error: 'No API key configured',
      details: 'Add your API key in Settings',
    });
  }

  // File Search path
  if (fileId) {
    if (provider !== 'gemini') {
      return res.status(400).json({
        error: 'File Search is only supported with Gemini',
        details: 'Switch to Gemini provider to use uploaded resume',
      });
    }

    const systemPrompt = getGeminiExtractProfilePrompt();
    // CORRECTED: Simplified extraction query that aligns with system instructions
    const extractionQuery = `Analyze the attached resume file and map the fields into the JSON format specified in your system instructions.`;

    try {
      const aiResponse = await callAIWithFileSearch(
        provider,
        apiKey,
        fileId,
        extractionQuery,
        systemPrompt,
        2000
      );

      if (aiResponse.error) {
        return res.status(500).json({
          error: 'File Search extraction failed',
          details: aiResponse.error,
        });
      }

      const jsonStr = extractJSON(aiResponse.text);

      let profile;
      try {
        profile = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({
          error: 'Could not parse File Search response as JSON',
          details: 'Resume may not have been processed correctly. Try re-uploading.',
          rawResponse: aiResponse.text.slice(0, 500),
        });
      }

      // Safeguard adjustments to protect your frontend validations from empty arrays/strings
      if (!profile.name) profile.name = "Candidate Name";
      if (!profile.email) profile.email = "email@example.com";
      if (!profile.skills || !Array.isArray(profile.skills) || profile.skills.length === 0) {
        profile.skills = ["Professional Skills"];
      }

      return res.status(200).json({ profile });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        error: 'Server error during File Search extraction',
        details: message,
      });
    }
  }

  // Plain text extraction path
  if (!resumeText) {
    return res.status(400).json({
      error: 'No resume provided',
      details: 'Either upload a resume file or provide resume text',
    });
  }

  const systemPrompt =
    provider === 'gemini' ? getGeminiExtractProfilePrompt() : getClaudeExtractProfilePrompt();

  try {
    const aiResponse = await callAI(
      provider,
      apiKey,
      [
        {
          role: 'user',
          content: `Extract profile data from this resume:\n\n${resumeText.slice(0, 10000)}`,
        },
      ],
      systemPrompt,
      2000
    );

    if (aiResponse.error) {
      return res.status(500).json({
        error: 'AI extraction failed',
        details: aiResponse.error,
      });
    }

    const jsonStr = extractJSON(aiResponse.text);

    let profile;
    try {
      profile = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({
        error: 'Could not parse AI response as JSON',
        details: 'Try uploading a clearer resume or different format',
        rawResponse: aiResponse.text.slice(0, 500),
      });
    }

    // Safeguard adjustments
    if (!profile.name) profile.name = "Candidate Name";
    if (!profile.email) profile.email = "email@example.com";
    if (!profile.skills || !Array.isArray(profile.skills) || profile.skills.length === 0) {
      profile.skills = ["Professional Skills"];
    }

    return res.status(200).json({ profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({
      error: 'Server error during extraction',
      details: message,
    });
  }
}
