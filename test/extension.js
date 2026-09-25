// Load the built extension into a visible Chrome, visit pages, screenshot the banner.
//   node test/extension.js [url ...]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ext = new URL("../extension", import.meta.url).pathname;
const urls = process.argv.slice(2);
mkdirSync("runs/shots", { recursive: true });
const ctx = await chromium.launchPersistentContext("runs/ext-profile", {
  channel: process.env.CHANNEL || "chrome", headless: false, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--disable-features=DisableLoadExtensionCommandLineSwitch"],
});
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
console.log("extension worker:", sw ? sw.url() : "NOT LOADED");
if (sw) sw.on("console", (m) => console.log("  [sw]", m.text()));
for (const url of urls) {
  const tab = await ctx.newPage();
  tab.on("console", (m) => m.text().includes("[tells]") && console.log("  [tab]", m.text()));
  await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log(e.message));
  await tab.waitForTimeout(12000);
  const text = await tab.evaluate(() => document.querySelector("tells-banner")?.shadowRoot.querySelector(".line")?.innerText || null);
  const name = new URL(url).hostname.replace(/^www\./, "");
  await tab.screenshot({ path: `runs/shots/${name}.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } });
  console.log(`${name}: ${text ? text.replace(/\n/g, " ") : "(no banner)"}`);
  await tab.close();
}
await ctx.close();
