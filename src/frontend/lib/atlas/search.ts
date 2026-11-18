/**
 * Client-side Atlas search. Supports direct search (entity names, aliases) and
 * problem-oriented search ("how do I reduce database load?") by weighting
 * problem phrasings and decision questions. Pure; safe for client components.
 */
import { entityHref, journeyHref, TYPE_META } from "./meta";
import type { AtlasEntity, EntityType, Journey } from "./types";

export type SearchDocType = EntityType | "journey";

export interface SearchDoc {
  id: string;
  type: SearchDocType;
  typeLabel: string;
  title: string;
  description: string;
  href: string;
  layer?: string;
  aliases: string[];
  tags: string[];
  question?: string;
  problems: string[];
  /** Lowercased body text for low-weight matching. */
  body: string;
  /** Number of filled sections; a small completeness signal. */
  completeness: number;
}

export interface SearchResult {
  doc: SearchDoc;
  score: number;
}

export const MAX_QUERY_LENGTH = 200;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "do", "does", "for", "from", "how", "i", "in",
  "is", "it", "me", "my", "need", "of", "on", "or", "our", "should", "so", "the", "to", "use",
  "we", "what", "when", "which", "why", "with", "you", "your", "vs", "versus", "get", "keep",
]);

const QUESTION_START = /^(how|should|what|why|when|which|do|does|can|is|my|our|we|i)\b/;

function flatten(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  return Array.isArray(v) ? v.join(" ") : v;
}

export function toSearchDoc(e: AtlasEntity, layerTitle?: string): SearchDoc {
  const body = Object.values(e.sections).map(flatten).join(" ").toLowerCase();
  const doc: SearchDoc = {
    id: e.id,
    type: e.type,
    typeLabel: TYPE_META[e.type].label,
    title: e.title,
    description: e.description,
    href: entityHref(e),
    aliases: e.aliases ?? [],
    tags: e.tags,
    problems: e.problems ?? [],
    body: body.slice(0, 4000),
    completeness: Object.keys(e.sections).length,
  };
  if (layerTitle) doc.layer = layerTitle;
  if (e.question) doc.question = e.question;
  return doc;
}

export function journeyToSearchDoc(j: Journey): SearchDoc {
  return {
    id: `journey-${j.id}`,
    type: "journey",
    typeLabel: "Decision Journey",
    title: j.title,
    description: j.summary,
    href: journeyHref(j.id),
    aliases: [],
    tags: [],
    problems: [j.title],
    body: j.steps.map((s) => s.why).join(" ").toLowerCase(),
    completeness: j.steps.length,
  };
}

/** Light suffix stemming so "scaling", "scale" and "scaled" match. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of ["ing", "ies", "es", "ed", "s", "e"]) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) {
      w = suffix === "ies" ? `${w.slice(0, -3)}y` : w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0);
}

export function queryTerms(query: string): string[] {
  const all = tokenize(query.slice(0, MAX_QUERY_LENGTH));
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return (meaningful.length > 0 ? meaningful : all).map(stem);
}

function fieldMatches(fieldTokens: string[], term: string): boolean {
  return fieldTokens.some((t) => {
    const s = stem(t);
    return s === term || (term.length >= 3 && s.startsWith(term));
  });
}

const WEIGHTS = { title: 10, alias: 8, problems: 7, tags: 6, question: 5, description: 3, body: 1 } as const;

export function scoreDoc(doc: SearchDoc, query: string): number {
  const q = query.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);
  if (q.length === 0) return 0;
  const terms = queryTerms(q);
  if (terms.length === 0) return 0;

  const fields = {
    title: tokenize(doc.title),
    alias: tokenize(doc.aliases.join(" ")),
    problems: tokenize(doc.problems.join(" ")),
    tags: tokenize(doc.tags.join(" ")),
    question: tokenize(doc.question ?? ""),
    description: tokenize(doc.description),
    body: tokenize(doc.body),
  };

  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let best = 0;
    for (const [name, tokens] of Object.entries(fields) as [keyof typeof WEIGHTS, string[]][]) {
      if (fieldMatches(tokens, term)) best = Math.max(best, WEIGHTS[name]);
    }
    if (best > 0) matched++;
    score += best;
  }
  if (matched === 0) return 0;
  // Multi-word queries need most terms to match somewhere.
  if (terms.length >= 3 && matched / terms.length < 0.5) return 0;
  score *= matched / terms.length;

  const title = doc.title.toLowerCase();
  if (title === q || doc.aliases.some((a) => a.toLowerCase() === q)) score += 100;
  else if (title.startsWith(q)) score += 40;
  else if (title.includes(q)) score += 25;
  if (doc.problems.some((p) => p.toLowerCase().includes(q))) score += 20;

  // Problem-shaped queries favour decisions and journeys over raw technology pages.
  const problemIntent = QUESTION_START.test(q) || q.includes("?");
  if (problemIntent && (doc.type === "decision" || doc.type === "comparison" || doc.type === "journey")) {
    score += 6;
  }
  score += Math.min(doc.completeness, 12) * 0.1;
  return score;
}

export function searchDocs(docs: SearchDoc[], query: string, types?: ReadonlySet<SearchDocType>): SearchResult[] {
  return docs
    .filter((d) => !types || types.size === 0 || types.has(d.type))
    .map((doc) => ({ doc, score: scoreDoc(doc, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
}
