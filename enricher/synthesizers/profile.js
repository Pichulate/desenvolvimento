import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// API key resolution (priority order)
// ---------------------------------------------------------------------------

async function resolveApiKey() {
  // 1. Already set in environment
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Try loading from enricher/data/.env
  try {
    const { config } = await import('dotenv');
    const envPath = join(__dirname, '..', 'data', '.env');
    config({ path: envPath, override: false });
    if (process.env.ANTHROPIC_API_KEY) {
      return process.env.ANTHROPIC_API_KEY;
    }
  } catch {
    // dotenv unavailable or .env missing — continue to fallback
  }

  return null; // will use CLI fallback
}

// ---------------------------------------------------------------------------
// Fallback: call `claude --print "<prompt>"` via child_process
// ---------------------------------------------------------------------------

function runClaudeCli(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });
    proc.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é um assistente que gera perfis estruturados de mentores de negócios.
Baseie-se EXCLUSIVAMENTE nos dados fornecidos.
NÃO invente informações ausentes nas fontes. Se um campo não tiver evidência, retorne null.
Retorne SOMENTE JSON válido, sem texto adicional, sem markdown code blocks.`;

function buildUserPrompt(mentor, newsItems) {
  let linkedinSection;
  if (mentor.linkedin_data) {
    try {
      const parsed = JSON.parse(mentor.linkedin_data);
      linkedinSection = JSON.stringify(parsed, null, 2);
    } catch {
      linkedinSection = String(mentor.linkedin_data);
    }
  } else {
    linkedinSection = 'Não disponível';
  }

  const newsSection = newsItems.map((item) => [
    `Título: ${item.title ?? ''}`,
    `Data: ${item.date ?? ''}`,
    `URL: ${item.url ?? ''}`,
    `Resumo: ${item.snippet ?? ''}`,
    '---',
  ].join('\n')).join('\n');

  return `DADOS DO LINKEDIN:
${linkedinSection}

NOTÍCIAS E ARTIGOS (${newsItems.length} itens):
${newsSection}

Retorne este JSON:
{
  "tldr": "<1 frase objetiva: quem é e qual é o superpoder principal>",
  "bio": "<2-3 parágrafos: trajetória, o que construiu, onde tem autoridade real>",
  "topics": ["<topic1>", "<topic2>", "<topic3>"],
  "timeline": [
    { "year": "YYYY", "event": "<descrição do evento>", "source": "<url da fonte — obrigatório>" }
  ],
  "publicVoice": "<padrão de comunicação pública nas fontes, ou null>",
  "dataQuality": "<alta | média | baixa>"
}`;
}

// ---------------------------------------------------------------------------
// dataQuality evaluation
// ---------------------------------------------------------------------------

function evaluateDataQuality(mentor, newsItems) {
  // Check LinkedIn quality: has experience with >= 2 entries
  let linkedinGood = false;
  if (mentor.linkedin_data) {
    try {
      const parsed = JSON.parse(mentor.linkedin_data);
      linkedinGood = Array.isArray(parsed.experience) && parsed.experience.length >= 2;
    } catch {
      linkedinGood = false;
    }
  }

  // Check news quality: >= 1 item with date < 2 years old
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const recentNews = newsItems.some((item) => {
    if (!item.date) return false;
    try {
      return new Date(item.date) >= twoYearsAgo;
    } catch {
      return false;
    }
  });

  if (linkedinGood && recentNews) return 'alta';
  if (linkedinGood || recentNews) return 'média';
  return 'baixa';
}

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

function parseAiResponse(raw) {
  // Strip optional ```json ... ``` wrappers
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Fallback profile
// ---------------------------------------------------------------------------

const FALLBACK_PROFILE = {
  tldr: null,
  bio: null,
  topics: [],
  timeline: [],
  publicVoice: null,
  dataQuality: 'baixa',
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Synthesizes a structured AI profile for a mentor.
 *
 * @param {object} mentor       - Mentor row from the DB (may include linkedin_data)
 * @param {object[]} newsItems  - Array of news items for this mentor
 * @returns {Promise<AiProfile>}
 */
export async function synthesize(mentor, newsItems) {
  const userPrompt = buildUserPrompt(mentor, newsItems);

  try {
    const apiKey = await resolveApiKey();

    if (apiKey) {
      // Use the Anthropic SDK
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const raw = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const parsed = parseAiResponse(raw);
      // Override dataQuality with our own deterministic evaluation
      parsed.dataQuality = evaluateDataQuality(mentor, newsItems);
      return parsed;
    }

    // Fallback: use `claude` CLI
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;
    const raw = await runClaudeCli(fullPrompt);
    const parsed = parseAiResponse(raw);
    parsed.dataQuality = evaluateDataQuality(mentor, newsItems);
    return parsed;
  } catch (err) {
    console.error('[synthesize] Error generating profile:', err.message);
    // Return deterministic dataQuality in the fallback as well
    return {
      ...FALLBACK_PROFILE,
      dataQuality: evaluateDataQuality(mentor, newsItems),
    };
  }
}
