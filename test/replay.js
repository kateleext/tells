// Re-run analysis + banner on saved captures in runs/, no crawling.
//   npm run replay               # every run
//   npm run replay -- hims goodrx
import { readdirSync, readFileSync } from "node:fs";
import { analyze } from "../agent/analyze.js";
import { blockedBar } from "../agent/lines.js";
import { bannerFacts, writeBanner, tricksOf } from "../agent/banner.js";
import { classify } from "../agent/jev.js";

const only = process.argv.slice(2);
const files = readdirSync("runs").filter((f) => f.endsWith(".json") && (!only.length || only.some((o) => f.includes(o))));

await Promise.all(files.map(async (f) => {
  const { page, reqs } = JSON.parse(readFileSync(`runs/${f}`));
  const { companies } = analyze(page, reqs);
  const live = companies.filter((c) => !c.blocked);
  if (!live.length) return console.log(`\n━━ ${page.domain}  nothing got through`);
  let t = Date.now();
  const j = await classify(page, live, process.env.TYPESAFE_API_KEY).catch((e) => (console.log(e.message), null));
  const jevMs = Date.now() - t;
  live.forEach((c, i) => (c.sensitivity = j?.companies[i].sensitivity ?? 0));
  const tricks = tricksOf(companies);
  const top = Math.max(...live.map((c) => c.sensitivity));
  const show = top >= 1.5 || tricks.length > 0 || live.some((c) => ["add_to_cart", "checkout", "purchase"].includes(c.top.canon));
  t = Date.now();
  const banner = show ? await writeBanner(bannerFacts(page, companies, j?.siteKind), process.env.ANTHROPIC_API_KEY).catch((e) => `(failed: ${e.message.slice(0, 120)})`) : "(quiet)";
  const out = [`\n━━ ${page.domain}  [${j?.siteKind} ${j?.siteKindConfidence.toFixed(2)}]  top sensitivity ${top.toFixed(2)}  Jev ${jevMs}ms, Claude ${((Date.now() - t) / 1000).toFixed(1)}s`,
    `   ▌ ${banner}`,
    `     ${live.sort((a, b) => b.sensitivity - a.sensitivity).slice(0, 4).map((c) => `${c.owner} ${c.sensitivity.toFixed(1)}`).join(" · ")}`,
    ...tricks.map((x) => `     trick: ${x}`)];
  const bar = blockedBar(companies);
  if (bar) out.push(`     bar: ${bar.text}`);
  console.log(out.join("\n"));
}));
