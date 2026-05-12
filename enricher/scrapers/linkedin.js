/**
 * linkedin.js — Descoberta e scraping de perfis LinkedIn
 *
 * Exports:
 *   findLinkedInUrl(name) → LinkedInDiscovery
 *     LinkedInDiscovery: { url, confianca, motivo }
 *     confianca: 'alta' | 'média' | 'baixa' | null
 *
 *   scrapeProfile(url, opts?) → LinkedInData
 *     LinkedInData: { name, headline, about, experience[], education[] }
 *     experience[]: { company, title, startDate, endDate, description }
 *     education[]:  { school, degree, field, startDate, endDate }
 *     opts: { mentorId? }
 *
 * NOTA: scrapeProfile requer sessão LinkedIn autenticada.
 *   Na primeira execução, abrirá um browser visível para login manual.
 *   A sessão é salva em enricher/data/linkedin-session.json e reutilizada
 *   nas execuções seguintes.
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SESSION_FILE = join(DATA_DIR, 'linkedin-session.json');
const DIAG_DIR = join(DATA_DIR, 'diag');

// ---------------------------------------------------------------------------
// Localização do executável Chromium
// Suporta o ambiente onde playwright-browsers está em /opt/pw-browsers com
// versão diferente da esperada pelo pacote instalado.
// ---------------------------------------------------------------------------

/**
 * Retorna opções de executablePath para chromium.launch() quando o binário
 * padrão do Playwright não estiver disponível mas houver um em /opt/pw-browsers.
 * Retorna objeto vazio se o caminho padrão existir (deixa playwright resolver).
 */
function chromiumExecOpts(headless = true) {
  // Caminhos candidatos: headless_shell para headless, chrome para headed
  const candidates = headless
    ? [
        '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
        '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      ]
    : [
        '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
      ];

  for (const p of candidates) {
    if (existsSync(p)) return { executablePath: p };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Garante que os diretórios necessários existam. */
function ensureDirs() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(DIAG_DIR, { recursive: true });
}

/**
 * Verifica se ao menos 2 palavras do nome aparecem no texto (case-insensitive).
 * Ignora palavras curtas (≤ 2 chars) para evitar falsos positivos com "de/da/do".
 */
function nameMatchesText(name, text) {
  if (!text) return false;
  const words = name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const lower = text.toLowerCase();
  const matched = words.filter((w) => lower.includes(w));
  return matched.length >= 2;
}

// ---------------------------------------------------------------------------
// TAREFA 03 — findLinkedInUrl
// ---------------------------------------------------------------------------

/**
 * Busca o perfil LinkedIn de uma pessoa pelo nome via Bing.
 *
 * @param {string} name — Nome completo da pessoa
 * @returns {Promise<{ url: string|null, confianca: 'alta'|'média'|'baixa'|null, motivo: string|null }>}
 */
export async function findLinkedInUrl(name) {
  const query = encodeURIComponent(`site:linkedin.com/in "${name}"`);
  const searchUrl = `https://www.bing.com/search?q=${query}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...chromiumExecOpts(true) });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Navega e aguarda carregamento (domcontentloaded + espera por networkidle opcional)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    // Tenta aguardar networkidle, mas não falha se demorar demais
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    // Coleta os primeiros 3 hrefs que contenham linkedin.com/in/
    const results = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const seen = new Set();
      const found = [];

      for (const a of anchors) {
        const href = a.href || '';
        // Normaliza: remove parâmetros de tracking e âncoras
        let clean = href.split('?')[0].split('#')[0];

        if (!clean.includes('linkedin.com/in/')) continue;

        // Remove trailing slash para deduplicar
        clean = clean.replace(/\/$/, '');

        if (seen.has(clean)) continue;
        seen.add(clean);

        found.push({
          url: clean,
          linkText: a.textContent?.trim() ?? '',
        });

        if (found.length >= 3) break;
      }

      return found;
    });

    if (results.length === 0) {
      return { url: null, confianca: null, motivo: 'Nenhum perfil encontrado' };
    }

    // Regra de confiança
    if (results.length === 1 && nameMatchesText(name, results[0].linkText)) {
      return { url: results[0].url, confianca: 'alta', motivo: null };
    }

    if (results.length >= 2 && results.length <= 3) {
      return { url: results[0].url, confianca: 'média', motivo: null };
    }

    // Resultados existem mas nenhum bate claramente com o nome
    return {
      url: results[0].url,
      confianca: 'baixa',
      motivo: 'Perfil LinkedIn ambíguo — verificar manualmente',
    };
  } catch (err) {
    return { url: null, confianca: null, motivo: `Erro na busca: ${err.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// TAREFA 04 — ensureSession + scrapeProfile
// ---------------------------------------------------------------------------

/**
 * Garante que exista uma sessão LinkedIn autenticada.
 * - Se linkedin-session.json NÃO existir: abre browser headed, aguarda login
 *   manual e salva o storageState.
 * - Se o arquivo JÁ existir: cria contexto a partir do storageState salvo.
 *
 * @param {import('playwright').Browser} browser
 * @returns {Promise<import('playwright').BrowserContext>}
 */
async function ensureSession(browser) {
  ensureDirs();

  if (!existsSync(SESSION_FILE)) {
    // --- Login manual ---
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('LinkedIn: faça login no browser e aguarde o feed carregar...');

    // Polling a cada 2s por até 120s
    const deadline = Date.now() + 120_000;
    let loggedIn = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const currentUrl = page.url();
      if (currentUrl.includes('/feed/')) {
        loggedIn = true;
        break;
      }
    }

    if (!loggedIn) {
      await context.close();
      throw new Error('LinkedIn: timeout de 120s esperando login manual. Tente novamente.');
    }

    const storageState = await context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(storageState), 'utf-8');
    console.log('Sessão LinkedIn salva.');

    // Retorna o contexto já autenticado
    return context;
  }

  // --- Restaura sessão salva ---
  const storageState = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
  const context = await browser.newContext({ storageState });
  return context;
}

/**
 * Faz scraping de um perfil LinkedIn autenticado.
 *
 * NOTA: Requer sessão LinkedIn válida. Na primeira execução, abrirá um browser
 * visível para que o usuário faça login manualmente.
 *
 * @param {string} url — URL completa do perfil LinkedIn (ex: https://linkedin.com/in/usuario)
 * @param {{ mentorId?: number|string }} opts
 * @returns {Promise<{
 *   name: string|null,
 *   headline: string|null,
 *   about: string|null,
 *   experience: Array<{ company, title, startDate, endDate, description }>,
 *   education: Array<{ school, degree, field, startDate, endDate }>
 * }>}
 */
export async function scrapeProfile(url, opts = {}) {
  const EMPTY = { name: null, headline: null, about: null, experience: [], education: [] };
  ensureDirs();

  let browser;
  let context;
  try {
    // LinkedIn bloqueia headless — sempre usar headed
    browser = await chromium.launch({ headless: false, ...chromiumExecOpts(false) });

    context = await ensureSession(browser);
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Verifica se foi redirecionado para login/authwall
    const afterNav = page.url();
    if (afterNav.includes('/login') || afterNav.includes('/authwall/')) {
      console.warn('[linkedin.js] Sessão expirada — solicitando novo login...');
      // Deleta sessão antiga para forçar novo login
      try { unlinkSync(SESSION_FILE); } catch (_) {}

      await context.close();
      context = await ensureSession(browser);
      const page2 = await context.newPage();
      await page2.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return await extractProfileData(page2, opts, browser);
    }

    return await extractProfileData(page, opts, browser);
  } catch (err) {
    console.error('[linkedin.js] Erro em scrapeProfile:', err.message);
    return EMPTY;
  } finally {
    // Fecha contexto mas NÃO fecha o browser (pode ser reutilizado)
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Extrai os dados de um perfil LinkedIn a partir de uma página já carregada.
 * Usa seletores semânticos (h1, aria-label, id) em vez de class names voláteis.
 *
 * @param {import('playwright').Page} page
 * @param {{ mentorId?: number|string }} opts
 * @param {import('playwright').Browser} browser — usado apenas para fechar no finally do caller
 * @returns {Promise<LinkedInData>}
 */
async function extractProfileData(page, opts = {}) {
  // Aguarda o h1 principal (nome) — sinal de que o perfil carregou
  await page.waitForSelector('h1', { timeout: 15_000 }).catch(() => {});

  // Scroll suave para acionar lazy-loading das seções
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' }));
  await new Promise((r) => setTimeout(r, 1_500));
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await new Promise((r) => setTimeout(r, 1_500));

  const data = await page.evaluate(() => {
    // -----------------------------------------------------------------------
    // Helpers internos (rodam no contexto do browser)
    // -----------------------------------------------------------------------
    const text = (el) => el?.textContent?.trim() ?? null;

    /** Retorna o primeiro elemento que corresponda a qualquer seletor da lista */
    const first = (...selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    };

    /**
     * Encontra uma seção pelo título (id ou texto do heading interno).
     * Retorna a seção raiz ou null.
     */
    const findSection = (sectionId) => {
      // Tenta por id direto
      const byId = document.getElementById(sectionId);
      if (byId) return byId.closest('section') || byId;

      // Tenta por aria-label contendo o texto
      const byAria = document.querySelector(
        `section[aria-label*="${sectionId}" i], div[aria-label*="${sectionId}" i]`
      );
      if (byAria) return byAria;

      // Tenta localizar via heading (h2/h3) com texto equivalente
      const headings = document.querySelectorAll('h2, h3');
      for (const h of headings) {
        if (h.textContent?.trim().toLowerCase().includes(sectionId.toLowerCase())) {
          return h.closest('section') || h.parentElement;
        }
      }
      return null;
    };

    // -----------------------------------------------------------------------
    // name — primeiro h1
    // -----------------------------------------------------------------------
    const nameEl = document.querySelector('h1');
    const name = text(nameEl);

    // -----------------------------------------------------------------------
    // headline — próximo ao topo, elemento com classe text-body-medium ou
    //            aria-label contendo "Current position" / "Cargo atual"
    // -----------------------------------------------------------------------
    const headlineEl =
      document.querySelector('[aria-label="Current position"]') ||
      document.querySelector('[aria-label="Cargo atual"]') ||
      // Elemento imediatamente após o h1 com texto médio
      nameEl?.closest('div')?.parentElement?.querySelector('.text-body-medium') ||
      document.querySelector('.text-body-medium');
    const headline = text(headlineEl);

    // -----------------------------------------------------------------------
    // about — seção "About" / "Sobre"
    // -----------------------------------------------------------------------
    const aboutSection = findSection('about') || findSection('sobre');
    let about = null;
    if (aboutSection) {
      // O texto principal fica em um span com class "visually-hidden" removido,
      // ou em um div/span descendente — pega o texto mais longo
      const candidates = aboutSection.querySelectorAll('span, p');
      let longest = '';
      for (const c of candidates) {
        const t = c.textContent?.trim() ?? '';
        if (t.length > longest.length) longest = t;
      }
      about = longest || text(aboutSection);
    }

    // -----------------------------------------------------------------------
    // experience — seção "Experience" / "Experiência"
    // -----------------------------------------------------------------------
    const expSection = findSection('experience') || findSection('experiência');
    const experience = [];
    if (expSection) {
      // Cada cargo fica em um <li> dentro de uma lista
      const items = expSection.querySelectorAll('li');
      for (const li of items) {
        // Empresa — span com aria-hidden="true" ou segundo span destacado
        const spans = li.querySelectorAll('span[aria-hidden="true"]');
        const allSpans = [...spans].map((s) => s.textContent?.trim()).filter(Boolean);

        // Título geralmente é o primeiro span proeminente; empresa vem depois
        // Usa heurística: título = primeiro elemento de destaque, empresa = segundo
        const title = allSpans[0] ?? null;
        const company = allSpans[1] ?? null;
        // Período costuma ter "–" ou "-" e meses/anos
        const periodSpan = [...li.querySelectorAll('span')].find((s) =>
          /\d{4}|presente|present|atual/i.test(s.textContent ?? '')
        );
        const period = periodSpan?.textContent?.trim() ?? null;

        // Tenta separar startDate e endDate
        let startDate = null;
        let endDate = null;
        if (period) {
          const parts = period.split(/\s*[–—-]\s*/);
          startDate = parts[0]?.trim() ?? null;
          endDate = parts[1]?.trim() ?? null;
        }

        const descEl = li.querySelector('p, [class*="description"]');
        const description = text(descEl);

        if (title || company) {
          experience.push({ company, title, startDate, endDate, description });
        }
      }
    }

    // -----------------------------------------------------------------------
    // education — seção "Education" / "Formação acadêmica"
    // -----------------------------------------------------------------------
    const eduSection =
      findSection('education') ||
      findSection('educação') ||
      findSection('formação');
    const education = [];
    if (eduSection) {
      const items = eduSection.querySelectorAll('li');
      for (const li of items) {
        const spans = li.querySelectorAll('span[aria-hidden="true"]');
        const allSpans = [...spans].map((s) => s.textContent?.trim()).filter(Boolean);

        const school = allSpans[0] ?? null;
        const degree = allSpans[1] ?? null;
        const field = allSpans[2] ?? null;

        const periodSpan = [...li.querySelectorAll('span')].find((s) =>
          /\d{4}|presente|present|atual/i.test(s.textContent ?? '')
        );
        const period = periodSpan?.textContent?.trim() ?? null;

        let startDate = null;
        let endDate = null;
        if (period) {
          const parts = period.split(/\s*[–—-]\s*/);
          startDate = parts[0]?.trim() ?? null;
          endDate = parts[1]?.trim() ?? null;
        }

        if (school) {
          education.push({ school, degree, field, startDate, endDate });
        }
      }
    }

    return { name, headline, about, experience, education };
  });

  // -------------------------------------------------------------------------
  // Screenshot de diagnóstico
  // -------------------------------------------------------------------------
  const mentorId = opts.mentorId ?? 'unknown';
  const screenshotPath = join(DIAG_DIR, `${mentorId}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch((err) => {
    console.warn('[linkedin.js] Não foi possível salvar screenshot:', err.message);
  });

  return {
    name: data.name ?? null,
    headline: data.headline ?? null,
    about: data.about ?? null,
    experience: data.experience ?? [],
    education: data.education ?? [],
  };
}
