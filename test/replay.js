// Re-run analysis + banner on saved captures in runs/, no crawling.
//   npm run replay               # every run
//   npm run replay -- hims goodrx
import { readdirSync, readFileSync } from "node:fs";
import { analyze } from "../agent/analyze.js";
import { blockedBar } from "../agent/lines.js";
import { bannerFacts, writeBanner, tricksOf } from "../agent/banner.js";

const only = process.argv.slice(2);
const files = readdirSync("runs").filter((f) => f.endsWith(".json") && (!only.length || only.some((o) => f.includes(o))));

await Promise.all(files.map(async (f) => {
  const { page, reqs } = JSON.parse(readFileSync(`runs/${f}`));
  const { companies } = analyze(page, reqs);
  const t = Date.now();
  const banner = companies.length && process.env.ANTHROPIC_API_KEY
    ? await writeBanner(bannerFacts(page, companies), process.env.ANTHROPIC_API_KEY).catch((e) => `(failed: ${e.message.slice(0, 120)})`)
    : "(no trackers)";
  const out = [`\n━━ ${page.domain}  (${companies.filter((c) => !c.blocked).length} companies, ${((Date.now() - t) / 1000).toFixed(1)}s)`,
    `   ▌ ${banner}`,
    ...tricksOf(companies).map((x) => `     trick: ${x}`)];
  const bar = blockedBar(companies);
  if (bar) out.push(`     bar: ${bar.text}`);
  console.log(out.join("\n"));
}));
