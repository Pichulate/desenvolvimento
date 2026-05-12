import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'mentors.db');

mkdirSync(join(__dirname, 'data'), { recursive: true });

export const db = new Database(DB_PATH);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mentors (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      linkedin_url        TEXT,
      linkedin_confianca  TEXT,
      linkedin_data       TEXT,
      ai_profile          TEXT,
      score         INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mentor_id   INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      date        TEXT,
      url         TEXT    NOT NULL,
      snippet     TEXT,
      source      TEXT,
      scraped_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_news_mentor  ON news_items(mentor_id);
    CREATE INDEX IF NOT EXISTS idx_news_date    ON news_items(date DESC);
    CREATE INDEX IF NOT EXISTS idx_mentor_score ON mentors(score DESC);
  `);
}

export function upsertMentor(name) {
  db.prepare(`INSERT OR IGNORE INTO mentors (name) VALUES (?)`).run(name);
  return db.prepare(`SELECT * FROM mentors WHERE name = ?`).get(name);
}

export function getMentor(id) {
  const mentor = db.prepare(`SELECT * FROM mentors WHERE id = ?`).get(id);
  if (!mentor) return null;
  const news = db.prepare(`SELECT * FROM news_items WHERE mentor_id = ? ORDER BY date DESC`).all(id);
  return { ...mentor, news };
}

export function listMentors() {
  return db.prepare(`
    SELECT m.*, COUNT(n.id) as news_count
    FROM mentors m
    LEFT JOIN news_items n ON n.mentor_id = m.id
    GROUP BY m.id
    ORDER BY m.updated_at DESC
  `).all();
}

export function insertNewsItems(mentorId, items) {
  const stmt = db.prepare(`
    INSERT INTO news_items (mentor_id, title, date, url, snippet, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const item of rows) {
      stmt.run(mentorId, item.title, item.date ?? null, item.url, item.snippet ?? null, item.source ?? null);
    }
  });
  insertMany(items);
}

export function updateLinkedinData(mentorId, { linkedin_url, linkedin_data, linkedin_confianca }) {
  db.prepare(`
    UPDATE mentors
    SET linkedin_url = ?, linkedin_data = ?, linkedin_confianca = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(linkedin_url ?? null, linkedin_data ?? null, linkedin_confianca ?? null, mentorId);
}

export function updateAiProfile(mentorId, { ai_profile, score }) {
  db.prepare(`
    UPDATE mentors
    SET ai_profile = ?, score = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(ai_profile ?? null, score ?? null, mentorId);
}

export function deleteMentor(id) {
  db.prepare(`DELETE FROM mentors WHERE id = ?`).run(id);
}
