import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, listMentors, upsertMentor, insertNewsItems, getMentor, updateLinkedinData, updateAiProfile } from './db.js';
import { searchNews } from './scrapers/news.js';
import { findLinkedInUrl, scrapeProfile } from './scrapers/linkedin.js';
import { synthesize } from './synthesizers/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/data/diag', express.static(join(__dirname, 'data', 'diag')));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'ui.html'));
});

// GET /api/mentors → lista todos os mentores com contagem de notícias
app.get('/api/mentors', (_req, res) => {
  try {
    const mentors = listMentors();
    res.json(mentors);
  } catch (err) {
    console.error('[server] GET /api/mentors:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrich → busca notícias, persiste e retorna resultados
app.post('/api/enrich', async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Campo "name" obrigatório.' });
  }

  try {
    const news = await searchNews(name.trim());
    const mentor = upsertMentor(name.trim());
    if (news.length > 0) {
      insertNewsItems(mentor.id, news);
    }
    res.json({ mentorId: mentor.id, news });
  } catch (err) {
    console.error('[server] POST /api/enrich:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mentors/:id — detalhe completo do mentor
app.get('/api/mentors/:id', (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });
  res.json(mentor);
});

// POST /api/enrich/:id/linkedin — scraping LinkedIn para mentor existente
app.post('/api/enrich/:id/linkedin', async (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });

  try {
    const discovery = await findLinkedInUrl(mentor.name);
    let linkedinData = null;
    if (discovery.url) {
      linkedinData = await scrapeProfile(discovery.url, { mentorId: mentor.id });
    }
    updateLinkedinData(mentor.id, {
      linkedin_url: discovery.url,
      linkedin_data: linkedinData ? JSON.stringify(linkedinData) : null,
      linkedin_confianca: discovery.confianca,
    });
    res.json({ mentorId: mentor.id });
  } catch (err) {
    console.error('[server] POST /api/enrich/:id/linkedin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: derive a simple score from dataQuality (full scorer.js comes in task 06)
function calcScoreFromProfile(profile) {
  const map = { alta: 80, média: 50, baixa: 20 };
  return map[profile?.dataQuality] ?? 20;
}

// POST /api/enrich/:id/synthesize — síntese AI com dados já no banco
app.post('/api/enrich/:id/synthesize', async (req, res) => {
  const mentor = getMentor(Number(req.params.id));
  if (!mentor) return res.status(404).json({ error: 'Mentor não encontrado.' });
  if (!mentor.linkedin_data && mentor.news.length === 0) {
    return res.status(400).json({ error: 'Mentor sem dados para sintetizar.' });
  }

  try {
    const profile = await synthesize(mentor, mentor.news);
    const score = calcScoreFromProfile(profile);
    updateAiProfile(mentor.id, {
      ai_profile: JSON.stringify(profile),
      score,
    });
    res.json({ mentorId: mentor.id, profile });
  } catch (err) {
    console.error('[server] POST /api/enrich/:id/synthesize:', err.message);
    res.status(500).json({ error: err.message });
  }
});

initDb();

app.listen(3000, () => {
  console.log('Enricher online at http://localhost:3000');
});
