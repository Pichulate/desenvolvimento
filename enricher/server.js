import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initDb, listMentors, upsertMentor, getMentor,
  insertNewsItems, clearNewsItems,
  updateLinkedinData, updateAiProfile, deleteMentor,
} from './db.js';
import { searchNews } from './scrapers/news.js';
import { findLinkedInUrl, scrapeProfile } from './scrapers/linkedin.js';
import { synthesize } from './synthesizers/profile.js';
import { calcScore } from './scorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/data/diag', express.static(join(__dirname, 'data', 'diag')));

app.get('/', (_req, res) => res.sendFile(join(__dirname, 'ui.html')));

// ---------------------------------------------------------------------------
// Job registry: Map<mentorId, { buffer: {line,event}[], res: Response|null }>
// Buffers SSE events until client connects, then flushes and goes live.
// ---------------------------------------------------------------------------
const activeJobs = new Map();

function createJob(mentorId) {
  const job = { buffer: [], res: null };
  activeJobs.set(mentorId, job);
  return job;
}

function makeSseEmit(mentorId) {
  return function emit(event, data) {
    const job = activeJobs.get(mentorId);
    if (!job) return;
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    if (job.res) {
      job.res.write(line);
      if (event === 'done' || event === 'error') {
        job.res.end();
        activeJobs.delete(mentorId);
      }
    } else {
      job.buffer.push({ line, event });
    }
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
async function runFullPipeline(mentor, linkedinUrlOverride, sseEmit) {
  const start = Date.now();
  try {
    sseEmit('progress', { step: 'start', message: `Iniciando enriquecimento de ${mentor.name}` });

    // Step 1 — paralelo
    const [newsItems, linkedinDiscovery] = await Promise.all([
      searchNews(mentor.name),
      linkedinUrlOverride
        ? Promise.resolve({ url: linkedinUrlOverride, confianca: 'alta', motivo: null })
        : findLinkedInUrl(mentor.name),
    ]);

    sseEmit('progress', { step: 'news_done', message: `${newsItems.length} notícia(s) encontrada(s)` });
    sseEmit('progress', {
      step: 'url_found',
      message: linkedinDiscovery.url
        ? `LinkedIn: ${linkedinDiscovery.url} (confiança: ${linkedinDiscovery.confianca})`
        : `LinkedIn não encontrado — ${linkedinDiscovery.motivo ?? 'sem resultado'}`,
    });

    // Step 2 — scraping LinkedIn
    let linkedinData = null;
    if (linkedinDiscovery.url) {
      linkedinData = await scrapeProfile(linkedinDiscovery.url, { mentorId: mentor.id });
      sseEmit('screenshot', { url: `/data/diag/${mentor.id}-latest.png` });
      sseEmit('progress', { step: 'linkedin_done', message: 'Perfil LinkedIn extraído' });
    }

    // Step 3 — score
    const { score_geral, alerta } = calcScore(linkedinDiscovery, newsItems);

    // Step 4 — síntese AI
    const enrichedMentor = { ...mentor, linkedin_data: linkedinData ? JSON.stringify(linkedinData) : null };
    const aiProfile = await synthesize(enrichedMentor, newsItems);
    sseEmit('synthesis_done', { profile: aiProfile });

    // Step 5 — persistir
    clearNewsItems(mentor.id);
    if (newsItems.length > 0) insertNewsItems(mentor.id, newsItems);
    updateLinkedinData(mentor.id, {
      linkedin_url: linkedinDiscovery.url,
      linkedin_data: linkedinData ? JSON.stringify(linkedinData) : null,
      linkedin_confianca: linkedinDiscovery.confianca,
    });
    updateAiProfile(mentor.id, { ai_profile: JSON.stringify(aiProfile), score: score_geral });

    sseEmit('done', { score: score_geral, alerta, duracao_segundos: (Date.now() - start) / 1000 });
  } catch (err) {
    console.error('[pipeline]', err.message);
    sseEmit('error', { message: err.message });
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

app.get('/api/mentors', (_req, res) => {
  try { res.json(listMentors()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/mentors/:id', (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  mentor ? res.json(mentor) : res.status(404).json({ error: 'Mentor não encontrado.' });
});

app.delete('/api/mentors/:id', (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });
  deleteMentor(mentor.id);
  res.status(204).end();
});

// POST /api/enrich — cria/atualiza mentor e dispara pipeline completo
app.post('/api/enrich', async (req, res) => {
  const { name, linkedinUrl } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'Campo "name" obrigatório.' });

  const mentor = upsertMentor(name.trim());
  createJob(mentor.id);
  res.json({ mentorId: mentor.id });

  // Fire-and-forget — cliente acompanha via SSE
  runFullPipeline(mentor, linkedinUrl ?? null, makeSseEmit(mentor.id));
});

// POST /api/enrich/:id/refresh — re-executa pipeline para mentor existente
app.post('/api/enrich/:id/refresh', async (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });

  createJob(mentor.id);
  res.json({ mentorId: mentor.id });
  runFullPipeline(mentor, req.body?.linkedinUrl ?? null, makeSseEmit(mentor.id));
});

// GET /api/enrich/:mentorId/stream — SSE de progresso do job ativo
app.get('/api/enrich/:mentorId/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const mentorId = Number(req.params.mentorId);
  const job = activeJobs.get(mentorId);

  if (!job) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Nenhum job ativo para este mentor.' })}\n\n`);
    return res.end();
  }

  // Flush eventos já bufferizados
  for (const { line, event } of job.buffer) {
    res.write(line);
    if (event === 'done' || event === 'error') return res.end();
  }
  job.buffer = [];
  job.res = res;

  req.on('close', () => { if (job.res === res) job.res = null; });
});

// POST /api/enrich/:id/linkedin — só scraping LinkedIn
app.post('/api/enrich/:id/linkedin', async (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });

  try {
    const discovery = await findLinkedInUrl(mentor.name);
    let linkedinData = null;
    if (discovery.url) linkedinData = await scrapeProfile(discovery.url, { mentorId: mentor.id });
    updateLinkedinData(mentor.id, {
      linkedin_url: discovery.url,
      linkedin_data: linkedinData ? JSON.stringify(linkedinData) : null,
      linkedin_confianca: discovery.confianca,
    });
    res.json({ mentorId: mentor.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrich/:id/synthesize — só síntese AI
app.post('/api/enrich/:id/synthesize', async (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });
  if (!mentor.linkedin_data && mentor.news.length === 0) {
    return res.status(400).json({ error: 'Mentor sem dados para sintetizar.' });
  }

  try {
    const profile = await synthesize(mentor, mentor.news);
    const { score_geral } = calcScore(
      { url: mentor.linkedin_url, confianca: mentor.linkedin_confianca },
      mentor.news,
    );
    updateAiProfile(mentor.id, { ai_profile: JSON.stringify(profile), score: score_geral });
    res.json({ mentorId: mentor.id, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
initDb();
app.listen(3000, () => console.log('Enricher online at http://localhost:3000'));
