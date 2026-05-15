import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { callAI, AIProvider } from '../../lib/ai-providers';
import { getClaudeGeneratePrompt } from '../../lib/claude-instructions';
import { getGeminiGeneratePrompt } from '../../lib/gemini-instructions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, jobData, jobDescription, instructions, apiKeyOverride, uploadedTemplate, aiProvider } = req.body;
  const provider: AIProvider = aiProvider || 'claude';

  const envKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  const anthropicKey = apiKeyOverride || envKey;
  if (!anthropicKey) return res.status(400).json({ error: 'No API key configured.' });

  // Prefer user-uploaded template from localStorage (passed in request body)
  // Fall back to blank public template shell
  let template = '';
  if (uploadedTemplate && uploadedTemplate.trim().length > 100) {
    template = uploadedTemplate;
  } else {
    const templateFile = type === 'resume' ? 'resume-template.html' : 'coverletter-template.html';
    const templatePath = path.join(process.cwd(), 'public', templateFile);
    try {
      template = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      return res.status(500).json({ error: `Could not load ${templateFile} template.` });
    }
  }

  const jobDesc = jobDescription || `
Company: ${jobData.company}
Job Title: ${jobData.title}
Role Summary: ${jobData.roleSummary}
Requirements: ${jobData.requirements?.join(', ')}
Key Details: ${jobData.whyYouFit?.join(', ')}
Apply URL: ${jobData.applyUrl}
  `.trim();

  const systemPrompt = provider === 'gemini'
    ? getGeminiGeneratePrompt(type, instructions)
    : getClaudeGeneratePrompt(type, instructions);

  const userMessage = `
COMPANY: ${jobData.company}
JOB TITLE: ${jobData.title}

JOB DESCRIPTION:
${jobDesc}

HTML TEMPLATE TO UPDATE:
${template}

Generate the complete tailored HTML. Return only the HTML document.`;

  try {
    const aiResponse = await callAI(
      provider,
      anthropicKey,
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      16000
    );

    if (aiResponse.error) {
      return res.status(500).json({ error: aiResponse.error });
    }

    let html = aiResponse.text;

    // Strip any accidental markdown fences
    html = html.replace(/^```html\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();

    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      return res.status(500).json({ error: 'Generated output does not appear to be valid HTML.' });
    }

    return res.status(200).json({ html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
