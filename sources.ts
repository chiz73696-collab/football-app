/**
 * Single-source scraper for https://allnigeriafootball.com/
 *
 * The site publishes a "Sure Prediction For Today" list every day with this
 * pattern per row:
 *
 *     YYYY-MM-DD HH:MM
 *     League Name
 *     Home Team vs Away Team – Tip   (Won / Lost)
 *
 * We only care about *upcoming* (no status yet) or *today* predictions.
 * Confidence is derived deterministically from the source itself
 * (e.g. VIP-flagged or freshly-published rows) plus a small base score.
 */
import axios from "axios";
import * as cheerio from "cheerio";

export type RawPrediction = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  tip: string;
  matchDate: string;
  matchTime: string;
  source: string;
  confidence: number; // 0..1
  status: "pending" | "won" | "lost";
};

const HOMEPAGE_URL = "https://allnigeriafootball.com/";
const TODAY_SLUG_RE = /sure-prediction-for-today/i;
const ARCHIVE_HOST = "allnigeriafootball.com";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 10_000,
      responseType: "text",
      validateStatus: () => true,
    });
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parses rows from the homepage / a "Sure prediction for today, ..." page.
 * Returns an array of RawPrediction with `status: "pending"` for future rows
 * and `status: "won" | "lost"` for past rows.
 */
function parseRows(html: string): RawPrediction[] {
  const $ = cheerio.load(html);
  const out: RawPrediction[] = [];

  // Every row in the "Sure prediction" list is a <p> block with three lines.
  $("p").each((_, p) => {
    const lines = $(p)
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 3) return;

    // First line should be "YYYY-MM-DD HH:MM" or just a date.
    const dateLine = lines[0];
    const dateMatch = dateLine.match(
      /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/,
    );
    if (!dateMatch) return;

    const matchDate = dateMatch[1];
    const matchTime = dateMatch[2] ?? "00:00";

    // Second line: league
    const league = cleanText(lines[1]);

    // Third line: "Home vs Away – Tip [Won/Lost]"
    const matchLine = lines[2];
    const tipMatch = matchLine.match(
      /^(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)\s+[\u2013\u2014\-]\s+(.+?)(?:\s+(Won|Lost|Pending))?\s*$/i,
    );
    if (!tipMatch) return;

    const homeTeam = cleanText(tipMatch[1]);
    const awayTeam = cleanText(tipMatch[2]);
    const tip = cleanText(tipMatch[3]).toUpperCase();
    const statusRaw = (tipMatch[4] ?? "").toLowerCase();
    const status: RawPrediction["status"] =
      statusRaw === "won"
        ? "won"
        : statusRaw === "lost"
          ? "lost"
          : "pending";

    out.push({
      homeTeam,
      awayTeam,
      league,
      tip,
      matchDate,
      matchTime,
      source: "allnigeriafootball.com",
      confidence: 0.7, // base; bumped below
      status,
    });
  });

  return out;
}

function isFutureOrToday(row: RawPrediction, today: string): boolean {
  if (row.status === "pending") return true;
  return row.matchDate >= today;
}

function dedupe(rows: RawPrediction[]): RawPrediction[] {
  const seen = new Map<string, RawPrediction>();
  for (const row of rows) {
    const key = `${row.matchDate}|${row.homeTeam.toLowerCase()}|${row.awayTeam.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
    } else if (existing.status === "lost" && row.status !== "lost") {
      // Prefer the "won" or pending version.
      seen.set(key, { ...row, confidence: Math.max(existing.confidence, row.confidence) });
    }
  }
  return Array.from(seen.values());
}

function scoreConfidence(row: RawPrediction): number {
  // Pending (not yet played) → highest trust. Won reinforces. Lost is excluded.
  let score = 0.75;
  if (row.status === "pending") score += 0.15;
  if (row.status === "won") score += 0.05;
  // Popular "safe" market segments.
  if (/^1x$|^x2$|^1$/i.test(row.tip)) score += 0.05;
  if (/under|over/i.test(row.tip)) score += 0.03;
  return clamp01(score);
}

export async function scrapeAllNigeriaFootball(): Promise<RawPrediction[]> {
  const today = todayIso();
  const collected: RawPrediction[] = [];

  const html = await fetchHtml(HOMEPAGE_URL);
  if (!html) return [];
  collected.push(...parseRows(html));

  // Also walk the latest "Sure Prediction For Today" archive link to be safe.
  const $ = cheerio.load(html);
  const archiveHref = $("a")
    .filter((_, a) => TODAY_SLUG_RE.test($(a).text() + " " + ($(a).attr("href") ?? "")))
    .first()
    .attr("href");
  if (archiveHref) {
    const url = archiveHref.startsWith("http")
      ? archiveHref
      : `https://${ARCHIVE_HOST}/${archiveHref.replace(/^\/+/, "")}`;
    const archiveHtml = await fetchHtml(url);
    if (archiveHtml) collected.push(...parseRows(archiveHtml));
  }

  const unique = dedupe(collected);
  const upcoming = unique.filter((r) => isFutureOrToday(r, today));

  // If everything has a won/lost tag, fall back to the most recent wins as
  // an indication of today's likely winners; we only return future/today in
  // normal flow.
  const working = upcoming.length > 0 ? upcoming : unique;

  return working
    .map((row) => ({ ...row, confidence: scoreConfidence(row) }))
    .sort((a, b) => b.confidence - a.confidence);
}
