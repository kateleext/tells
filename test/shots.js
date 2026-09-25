// README screenshots: load pages with the extension, crop the banner plus a slice of page.
//   node test/shots.js url [url ...]    -> docs/shots/<domain>.png
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";

const ext = new URL("../extension", import.meta.url).pathname;
mkdirSync("docs/shots", { recursive: true });
rmSync("runs/shot-profile", { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext("runs/shot-profile", {
  channel: "chromium", headless: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
await ctx.waitForEvent("serviceworker").catch(() => {});
for (const url of process.argv.slice(2)) try {
  const tab = await ctx.newPage();
  await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  const ok = await tab.waitForFunction(() => {
    const l = document.querySelector("tells-banner")?.shadowRoot.querySelectorAll(".seg");
    return l && l.length >= 2;
  }, null, { timeout: 25000 }).then(() => true, () => false);
  await tab.waitForTimeout(ok ? 1200 : 0);
  const text = await tab.evaluate(() => document.querySelector("tells-banner")?.shadowRoot.querySelector(".line")?.innerText || "");
  const name = new URL(url).hostname.replace(/^www\./, "");
  if (text) {
    const h = await tab.evaluate(() => document.querySelector("tells-banner").getBoundingClientRect().height);
    await tab.screenshot({ path: `docs/shots/${name}.png`, clip: { x: 0, y: 0, width: 1280, height: Math.ceil(h) + 90 } });
    if (process.env.STICKY) {
      await tab.mouse.wheel(0, 1400); await tab.waitForTimeout(800);
      await tab.screenshot({ path: `docs/shots/${name}-scrolled.png`, clip: { x: 0, y: 0, width: 1280, height: Math.ceil(h) + 90 } });
    }
  }
  console.log(`${name}: ${text.replace(/\n/g, " ") || "(no banner)"}`);
  await tab.close();
} catch (e) { console.log(`${url}: ${e.message.split("\n")[0]}`); }
await ctx.close();
