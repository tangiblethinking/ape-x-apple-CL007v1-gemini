import type { AIProvider } from './storage';
export type { AIProvider };

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  text: string;
  error?: string;
}

// ── Claude API ──────────────────────────────────────────────
async function callClaudeAPI(
  apiKey: string,
  messages: AIMessage[],
  systemPrompt?: string,
  maxTokens = 16000
): Promise<AIResponse> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return { text: '', error: err.error?.message || 'Claude API error' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return { text, error: text ? undefined : 'Empty response from Claude' };
  } catch (err: unknown) {
    return { text: '', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ── Gemini Model Resolution ─────────────────────────────────
const geminiModelCache = new Map<string, string>();

const GEMINI_PREFERRED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';

interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

interface ResolveResult {
  model: string;
  error?: string;
}

async function resolveGeminiModel(apiKey: string, excludeModels: string[] = []): Promise<ResolveResult> {
  const cached = geminiModelCache.get(apiKey);
  if (cached && !excludeModels.includes(cached)) return { model: cached };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `ListModels HTTP ${res.status}`;
      const fallback = excludeModels.includes(GEMINI_FALLBACK_MODEL) ? 'gemini-2.5-flash-lite' : GEMINI_FALLBACK_MODEL;
      geminiModelCache.set(apiKey, fallback);
      return { model: fallback, error: `Model discovery failed: ${errMsg}. Using fallback ${fallback}.` };
    }

    const data = await res.json();
    const models: GeminiModelInfo[] = data.models || [];

    const capable = models.filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent')
    );

    if (capable.length === 0) {
      geminiModelCache.set(apiKey, GEMINI_FALLBACK_MODEL);
      return { model: GEMINI_FALLBACK_MODEL, error: `No Gemini models support generateContent. Using fallback.` };
    }

    const capableNames = capable.map(m => m.name.replace(/^models\//, ''));

    for (const preferred of GEMINI_PREFERRED_MODELS) {
      if (capableNames.includes(preferred) && !excludeModels.includes(preferred)) {
        geminiModelCache.set(apiKey, preferred);
        return { model: preferred };
      }
    }

    const firstAvailable = capableNames.find(n => !excludeModels.includes(n));
    if (!firstAvailable) {
      return { model: '', error: `All Gemini models exhausted (excluded: ${excludeModels.join(', ')})` };
    }
    geminiModelCache.set(apiKey, firstAvailable);
    return { model: firstAvailable };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown ListModels error';
    geminiModelCache.set(apiKey, GEMINI_FALLBACK_MODEL);
    return { model: GEMINI_FALLBACK_MODEL, error: `ListModels exception: ${msg}. Using fallback.` };
  }
}

// Strict matching schema configuration for structured profile extraction
const GEMINI_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    email: { type: 'STRING' },
    skills: { type: 'ARRAY', items: { type: 'STRING' } },
    phone: { type: 'STRING' },
    linkedinUrl: { type: 'STRING' },
    portfolioUrl: { type: 'STRING' },
    additionalLinks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          url: { type: 'STRING' }
        }
      }
    },
    mostRecentRole: { type: 'STRING' },
    mostRecentEmployer: { type: 'STRING' },
    yearsExperience: { type: 'STRING' },
    coreStrengths: { type: 'STRING' },
    discipline: { type: 'STRING' },
    targetTitles: { type: 'ARRAY', items: { type: 'STRING' } },
    targetSectors: { type: 'ARRAY', items: { type: 'STRING' } },
    salaryMin: { type: 'NUMBER' },
    salaryMax: { type: 'NUMBER' }
  },
  required: ['name', 'email', 'skills']
};

// ── Gemini API ──────────────────────────────────────────────
async function callGeminiAPI(
  apiKey: string,
  messages: AIMessage[],
  systemPrompt?: string,
  maxTokens = 16000
): Promise<AIResponse> {
  const triedModels: string[] = [];
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { model, error: resolveError } = await resolveGeminiModel(apiKey, triedModels);

      if (!model) {
        return { text: '', error: resolveError || 'No Gemini model available' };
      }

      const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const isJsonTask = systemPrompt && /JSON|json object/i.test(systemPrompt);
      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.2,
          ...(isJsonTask && {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_JSON_SCHEMA
          })
        },
      };

      if (systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const apiMsg = err.error?.message || `Gemini API error (${response.status})`;
        const status = err.error?.status || '';

        const isQuotaError = response.status === 429
          || status === 'RESOURCE_EXHAUSTED'
          || /quota|rate limit|exceeded/i.test(apiMsg);

        if (isQuotaError && attempt < maxAttempts - 1) {
          triedModels.push(model);
          geminiModelCache.delete(apiKey);
          continue;
        }

        if (response.status === 404 && attempt < maxAttempts - 1) {
          triedModels.push(model);
          geminiModelCache.delete(apiKey);
          continue;
        }

        const triedNote = triedModels.length > 0 ? ` (tried: ${triedModels.join(', ')})` : '';
        const combined = resolveError
          ? `${apiMsg} | ${resolveError}${triedNote}`
          : `${apiMsg} (model: ${model})${triedNote}`;
        return { text: '', error: combined };
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        return { text: '', error: `Gemini returned no candidates (model: ${model})` };
      }

      if (candidate.finishReason === 'SAFETY') {
        return { text: '', error: 'Gemini blocked response due to safety filters' };
      }

      const text = candidate.content?.parts?.[0]?.text || '';
      if (!text) {
        return { text: '', error: `Empty response from Gemini (model: ${model})` };
      }

      return { text };
    } catch (err: unknown) {
      return { text: '', error: err instanceof Error ? err.message : 'Unknown Gemini error' };
    }
  }

  return { text: '', error: `All Gemini models exhausted after ${maxAttempts} attempts (tried: ${triedModels.join(', ')})` };
}

// ── Gemini File Search (RAG) ────────────────────────────────
async function callGeminiWithFileSearch(
  apiKey: string,
  fileId: string,
  query: string,
  systemPrompt?: string,
  maxTokens = 16000
): Promise<AIResponse> {
  const triedModels: string[] = [];
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { model, error: resolveError } = await resolveGeminiModel(apiKey, triedModels);

      if (!model) {
        return { text: '', error: resolveError || 'No Gemini model available' };
      }

      const normalizedFileId = fileId.startsWith('files/') ? fileId : `files/${fileId}`;

      // FIX: Casing changes to camelCase structures required by REST API endpoints
      const body: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: query },
              {
                fileData: {
                  fileUri: `https://generativelanguage.googleapis.com/v1beta/${normalizedFileId}`,
                  mimeType: 'application/pdf',
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_JSON_SCHEMA
        },
      };

      if (systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const apiMsg = err.error?.message || `Gemini File Search error (${response.status})`;
        const status = err.error?.status || '';

        const isQuotaError =
          response.status === 429 ||
          status === 'RESOURCE_EXHAUSTED' ||
          /quota|rate limit|exceeded/i.test(apiMsg);

        if (isQuotaError && attempt < maxAttempts - 1) {
          triedModels.push(model);
          geminiModelCache.delete(apiKey);
          continue;
        }

        if (response.status === 404 && attempt < maxAttempts - 1) {
          triedModels.push(model);
          geminiModelCache.delete(apiKey);
          continue;
        }

        const triedNote = triedModels.length > 0 ? ` (tried: ${triedModels.join(', ')})` : '';
        return { text: '', error: `${apiMsg}${triedNote}` };
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        return { text: '', error: `Gemini File Search returned no candidates (model: ${model})` };
      }

      if (candidate.finishReason === 'SAFETY') {
        return { text: '', error: 'Gemini File Search blocked response due to safety filters' };
      }

      const text = candidate.content?.parts?.[0]?.text || '';
      if (!text) {
        return { text: '', error: `Empty response from Gemini File Search (model: ${model})` };
      }

      return { text };
    } catch (err: unknown) {
      return { text: '', error: err instanceof Error ? err.message : 'Unknown Gemini File Search error' };
    }
  }

  return { text: '', error: `All Gemini models exhausted after ${maxAttempts} attempts` };
}

// ── Unified API Call ────────────────────────────────────────
export async function callAI(
  provider: AIProvider,
  apiKey: string,
  messages: AIMessage[],
  systemPrompt?: string,
  maxTokens = 16000
): Promise<AIResponse> {
  if (provider === 'claude') {
    return callClaudeAPI(apiKey, messages, systemPrompt, maxTokens);
  } else {
    return callGeminiAPI(apiKey, messages, systemPrompt, maxTokens);
  }
}

// ── File Search API Call ────────────────────────────────────
export async function callAIWithFileSearch(
  provider: AIProvider,
  apiKey: string,
  fileId: string,
  query: string,
  systemPrompt?: string,
  maxTokens = 16000
): Promise<AIResponse> {
  if (provider === 'claude') {
    return callClaudeAPI(apiKey, [{ role: 'user', content: query }], systemPrompt, maxTokens);
  } else {
    return callGeminiWithFileSearch(apiKey, fileId, query, systemPrompt, maxTokens);
  }
}

// ── JSON Extraction Helper ──────────────────────────────────
export function extractJSON(raw: string): string {
  if (!raw) return '{}';
  let cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/```\s*$/im, '').trim();

  try { JSON.parse(cleaned); return cleaned; } catch { /* continue */ }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
  }

  const aStart = cleaned.indexOf('[');
  const aEnd = cleaned.lastIndexOf(']');
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    const candidate = cleaned.slice(aStart, aEnd + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
  }

  return '{}';
}

// ── Validation Helpers ──────────────────────────────────────
export function validateAPIKey(provider: AIProvider, key: string): boolean {
  if (provider === 'claude') {
    return key.startsWith('sk-ant-') && key.length > 20;
  } else {
    return key.startsWith('AIza') && key.length > 30;
  }
}

export function getAPIKeyPlaceholder(provider: AIProvider): string {
  return provider === 'claude' ? 'sk-ant-api03-...' : 'AIzaSy...';
}

export function getAPIKeyNote(provider: AIProvider): string {
  if (provider === 'claude') {
    return 'Key must start with "sk-ant-" — check that you copied the full key';
  } else {
    return 'Key must start with "AIza" — check that you copied the full key';
  }
}

export function getProviderName(provider: AIProvider): string {
  return provider === 'claude' ? 'Claude (Anthropic)' : 'Gemini (Google)';
}

export function getProviderSetupURL(provider: AIProvider): string {
  return provider === 'claude' ? 'https://console.anthropic.com/settings/keys' : 'https://aistudio.google.com/app/apikey';
}

export function getProviderSetupSteps(provider: AIProvider): string[] {
  if (provider === 'claude') {
    return [
      'Go to console.anthropic.com/settings/keys in a new tab',
      'Sign in or create a free Anthropic account',
      'Click "Create Key" — name it anything (e.g. "job-hunt")',
      'Copy the key — it starts with sk-ant-',
      'Add a small amount of credit ($5–$10) under Billing — required to use the API',
      'Paste the key below'
    ];
  } else {
    return [
      'Go to aistudio.google.com/app/apikey in a new tab',
      'Sign in with your Google account',
      'Click "Create API Key" and select a Google Cloud project (or create one)',
      'Copy the API key — it starts with AIza',
      'Paste it below — Gemini has a generous free tier',
    ];
  }
}
