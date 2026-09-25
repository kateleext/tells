// Local proof of the pipeline, no extension:
//   headless Chrome loads a real page -> every request is captured ->
//   decode -> group into lines -> Jev -> print what the card would say.
//
//   npm run probe                      # the sites in test/sites.json
//   npm run probe -- https://x.com/p   # one-off URL
//
// Raw captures land in runs/ so decoders can be fixed without re-crawling.

import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analyze } from "../agent/analyze.js";
import { lineFor, blockedBar } from "../agent/lines.js";
import { classify } from "../agent/jev.js";
import { siteOf, ownerOf } from "../agent/trackers.js";

const headed = process.argv.includes("--headed");
const block = process.argv.includes("--block"); // simulate an ad blocker on known tracker hosts
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const sites = args.length ? args.map((url) => ({ url })) : JSON.parse(readFileSync(new URL("./sites.json", import.meta.url)));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const GATE = 1.5; // sensitivity (0-3) at which the card shows itself

mkdirSync("runs", { recursive: true });
// --headed: a visible Chrome with a persistent profile, i.e. a normal browser,
// which is what the extension will actually run in.
const browser = headed ? null : await chromium.launch({ channel: "chrome", headless: true });
const shared = headed ? await chromium.launchPersistentContext("runs/profile", { channel: "chrome", headless: false, viewport: null, locale: "en-US" }) : null;

for (const site of sites) {
  const ctx = shared || await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const tab = await ctx.newPage();
  const reqs = [];
  // outcome per request: what the site attempted vs what actually left the browser
  const byReq = new Map();
  tab.on("request", (r) => { const q = { url: r.url(), method: r.method(), body: r.postData() || "", outcome: "pending" }; byReq.set(r, q); reqs.push(q); });
  tab.on("requestfinished", (r) => byReq.has(r) && (byReq.get(r).outcome = "sent"));
  tab.on("requestfailed", (r) => byReq.has(r) && (byReq.get(r).outcome = /BLOCKED_BY_CLIENT/.test(r.failure()?.errorText) ? "blocked" : "failed"));
  if (block) await tab.route((u) => { try { return ownerOf(u.href) && ownerOf(u.href).kind !== "loader"; } catch { return false; } }, (route) => route.abort("blockedbyclient"));

  try {
    await tab.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await tab.waitForTimeout(4000);
    // most people click accept; show what that buys
    site.consented = await tab.getByRole("button", { name: /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree( and close)?|got it|ok)$/i })
      .first().click({ timeout: 2000 }).then(() => true, () => false);
    await tab.waitForTimeout(4000);
    if (site.action) await act(tab, site.action);
  } catch (err) {
    console.log(`\n✗ ${site.url}\n  ${err.message.split("\n")[0]}`);
  }

  const page = await tab.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"],meta[property="og:description"]')?.content || "",
  })).catch(() => ({ title: "", description: "" }));
  page.domain = new URL(tab.url()).hostname.replace(/^www\./, "");
  const first = siteOf(page.domain);
  const { events, companies } = analyze(page, reqs);
  writeFileSync(`runs/${first}.json`, JSON.stringify({ site, page, reqs, events }, null, 1));

  let judged = null, ms = 0;
  if (process.env.TYPESAFE_API_KEY && companies.length) {
    const t = Date.now();
    judged = await classify(page, companies, process.env.TYPESAFE_API_KEY).catch((e) => (console.log("  Jev failed:", e.message), null));
    ms = Date.now() - t;
  }

  const rows = companies.map((c, i) => ({ c, j: judged?.companies[i], line: lineFor(c, judged?.companies[i].verb) }))
    .sort((a, b) => (b.j?.sensitivity ?? 0) - (a.j?.sensitivity ?? 0));
  const show = rows.some((r) => !r.c.blocked && (r.j?.sensitivity ?? 0) >= GATE || ["record", "add_to_cart", "checkout", "purchase"].includes(r.c.top.canon));

  console.log(`\n━━ ${page.domain}  ${judged ? `[${judged.siteKind} ${judged.siteKindConfidence.toFixed(2)}] Jev ${ms}ms` : ""}`);
  console.log(`   ${reqs.length} requests, ${events.length} tracking events, ${companies.length} companies${site.consented ? ", clicked accept" : ""} → card ${show ? "SHOWS" : "stays quiet"}`);
  for (const { c, j, line } of rows.filter((r) => !r.c.blocked)) {
    console.log(`   ${j ? j.sensitivity.toFixed(1).padStart(4) : "   –"}  ${line.text}`);
    for (const f of c.facts.slice(0, 5)) console.log(`          · ${f.label}: ${f.value}`);
  }
  const bar = blockedBar(companies);
  if (bar) console.log(`   \x1b[42m\x1b[30m ${bar.text} \x1b[0m`);
  if (shared) await tab.close(); else await ctx.close();
}
await (shared || browser).close();

// Try the site's main action (e.g. add to cart) so the strong events fire.
async function act(tab, action) {
  if (action.goto) await tab.goto(action.goto, { waitUntil: "domcontentloaded" }), await tab.waitForTimeout(4000);
  if (action.search) {
    const box = tab.locator('input[type="search"], input[name="q"], input[name*="search" i]').first();
    await box.fill(action.search, { timeout: 5000 });
    await box.press("Enter");
  }
  if (action.click) await tab.getByRole("button", { name: new RegExp(action.click, "i") }).first().click({ timeout: 8000 });
  await tab.waitForTimeout(5000);
}
