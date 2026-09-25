// Money banners on tell's eval pages (cached HTML), compared with tell's full answers.
//   npm run money [-- id-substring ...]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseHTML } from "linkedom";
import { extractPage } from "../agent/extract.js";
import { moneyBanner } from "../agent/money.js";

const EVALS = "../tell/evals";
const only = process.argv.slice(2);
const pages = JSON.parse(readFileSync(`${EVALS}/pages.json`)).filter((p) => existsSync(`${EVALS}/cache/${p.id}.html`) && (!only.length || only.some((o) => p.id.includes(o))));

const results = await Promise.all(pages.map(async (p) => {
  const { document } = parseHTML(readFileSync(`${EVALS}/cache/${p.id}.html`, "utf8"));
  const page = extractPage(document, p.url);
  const t = Date.now();
  const out = await moneyBanner(page, process.env.ANTHROPIC_API_KEY).catch((e) => ({ verdict: "error", banner: e.message, passages: [] }));
  const tell = existsSync(`${EVALS}/answers/${p.id}.json`) ? JSON.parse(readFileSync(`${EVALS}/answers/${p.id}.json`)) : null;
  const norm = (s) => s.replace(/\s+/g, " ").toLowerCase();
  const found = out.passages.filter((q) => norm(page.text).includes(norm(q))).length;
  return { p, out, ms: Date.now() - t, tell, found, words: out.banner.split(/\s+/).filter(Boolean).length };
}));

for (const { p, out, ms, tell, found, words } of results) {
  console.log(`\n━━ ${p.id}  [${p.category}]  ${out.verdict}  ${(ms / 1000).toFixed(1)}s`);
  if (out.banner) console.log(`   ▌ ${out.banner}  (${words}w, ${found}/${out.passages.length} quotes on page)`);
  const expected = tell?.expected_verdict || tell?.verdict || tell?.expected?.verdict;
  if (expected) console.log(`     tell eval expects: ${expected}`);
}
