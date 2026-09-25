// Service worker: watches every request per tab (sent or blocked), runs the
// tracking pass (decode -> Jev -> Claude banner) and the money pass (Claude on
// page text), and streams both halves of the banner to the tab.

import { analyze } from "../../agent/analyze.js";
import { classify } from "../../agent/jev.js";
import { bannerFacts, writeBanner, tricksOf } from "../../agent/banner.js";
import { blockedBar, lineFor } from "../../agent/lines.js";
import { moneyBanner } from "../../agent/money.js";
import { worthAnalyzing } from "../../agent/extract.js";
import { RANK } from "../../agent/decode.js";

const GATE = 1.5;          // Jev sensitivity (0-3) at which tracking speaks up
const SETTLE = 2500;       // let the first wave of pixels fire before judging
const STRONG = ["add_to_cart", "checkout", "purchase"];
const MAX_RUNS = 6;        // per page: live updates (e.g. add to cart), then stop spending

const tabs = new Map();    // tabId -> state
const fresh = (url) => ({ url, reqs: new Map(), port: null, page: null, timer: null, sig: "", runs: 0, shown: null });

// A small rolling log in storage, so a run can be inspected without DevTools.
const trail = [];
function log(...a) {
  const line = `${new Date().toISOString().slice(11, 19)} ${a.join(" ")}`;
  console.info("[tells]", line);
  trail.push(line);
  if (trail.length > 80) trail.shift();
  chrome.storage.local.set({ log: trail }).catch(() => {});
}

async function keys() {
  const s = await chrome.storage.local.get(["anthropicKey", "typesafeKey"]);
  return { anthropic: s.anthropicKey, typesafe: s.typesafeKey };
}

// ----- capture -----

function bodyOf(rb) {
  if (!rb) return "";
  if (rb.formData) {
    const p = new URLSearchParams();
    for (const [k, vs] of Object.entries(rb.formData)) for (const v of vs) p.append(k, v);
    return p.toString();
  }
  if (rb.raw) {
    const dec = new TextDecoder();
    return rb.raw.map((part) => (part.bytes ? dec.decode(part.bytes) : "")).join("").slice(0, 50000);
  }
  return "";
}

chrome.webRequest.onBeforeRequest.addListener((d) => {
  if (d.tabId < 0) return;
  if (d.type === "main_frame") { tabs.set(d.tabId, fresh(d.url)); return; }
  if (!tabs.has(d.tabId)) tabs.set(d.tabId, fresh(d.initiator || d.url));
  const st = tabs.get(d.tabId);
  st.reqs.set(d.requestId, { url: d.url, method: d.method, body: bodyOf(d.requestBody), outcome: "pending" });
}, { urls: ["<all_urls>"] }, ["requestBody"]);

const settle = (outcome) => (d) => {
  const r = tabs.get(d.tabId)?.reqs.get(d.requestId);
  if (!r) return;
  r.outcome = typeof outcome === "function" ? outcome(d) : outcome;
  schedule(d.tabId, 1200);
};
chrome.webRequest.onCompleted.addListener(settle("sent"), { urls: ["<all_urls>"] });
chrome.webRequest.onErrorOccurred.addListener(
  settle((d) => (/BLOCKED_BY_CLIENT|BLOCKED_BY_ADMINISTRATOR/.test(d.error) ? "blocked" : "failed")),
  { urls: ["<all_urls>"] });

chrome.tabs.onRemoved.addListener((id) => tabs.delete(id));

// ----- tracking half -----

function schedule(tabId, wait) {
  const st = tabs.get(tabId);
  if (!st?.port || !st.page) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => track(tabId).catch((e) => console.error("[tells] tracking", e)), wait);
}

async function track(tabId) {
  const st = tabs.get(tabId);
  if (!st?.port || st.runs >= MAX_RUNS) return;
  const { companies } = analyze(st.page, [...st.reqs.values()].filter((r) => r.outcome !== "pending"));
  const live = companies.filter((c) => !c.blocked);
  // only re-judge when what companies got actually changed
  const sig = companies.map((c) => `${c.owner}:${c.top.canon}:${c.top.item || ""}:${c.blocked}`).sort().join("|");
  if (!companies.length || sig === st.sig) return;
  st.sig = sig;
  st.runs++;

  const k = await keys();
  const send = (msg) => { try { st.port.postMessage(msg); } catch {} };
  const bar = blockedBar(companies);

  let siteKind = null;
  if (k.typesafe && live.length) {
    const j = await classify(st.page, live, k.typesafe).catch((e) => (log("Jev failed:", e.message.slice(0, 160)), null));
    siteKind = j?.siteKind || null;
    live.forEach((c, i) => (c.sensitivity = j?.companies[i].sensitivity ?? 0));
    live.forEach((c, i) => (c.line = lineFor(c, j?.companies[i].verb).text));
  }
  const top = Math.max(0, ...live.map((c) => c.sensitivity ?? 0));
  const tricks = tricksOf(companies);
  const show = top >= GATE || (tricks.length && top >= 1) || live.some((c) => STRONG.includes(c.top.canon));
  const lines = live.sort((a, b) => (b.sensitivity ?? 0) - (a.sensitivity ?? 0)).map((c) => ({ text: c.line, sensitivity: c.sensitivity ?? null }));

  log(`track ${st.page.domain}: ${companies.length} companies (${live.length} live), top ${top.toFixed(2)}, site ${siteKind}, show ${!!show}, run ${st.runs}`);
  // AI or nothing: no key, no failed call, no templated fallback line
  if (!k.anthropic) { st.sig = ""; return log("track: no Anthropic key"); }
  if (!show) {
    // nothing sensitive got through; if a blocker did real work, gloat in green
    if (!bar || bar.names.length < 3 || st.shown != null) return;
    st.shown = -1;
    const text = await writeBanner(bannerFacts(st.page, companies, siteKind), k.anthropic).catch(() => null);
    if (text && st.sig === sig) send({ type: "track", tone: "safe", text, lines, bar: bar.text, tricks });
    return;
  }
  // once a line is on screen it stays: later pixels only refresh the drawer,
  // unless something stronger than what it's about happened (cart, checkout, purchase)
  const strongest = Math.max(...live.map((c) => RANK.indexOf(c.top.canon)));
  if (st.shown != null && !(strongest > st.shown && STRONG.includes(RANK[strongest]))) {
    return send({ type: "track-rows", lines, bar: bar?.text || null, tricks });
  }
  st.shown = strongest;
  const text = await writeBanner(bannerFacts(st.page, companies, siteKind), k.anthropic).catch((e) => (log("banner failed:", e.message.slice(0, 160)), null));
  if (!text) { st.shown = null; st.sig = ""; return; }
  log(`track line: ${text}`);
  if (st.sig === sig) send({ type: "track", tone: "loud", text, lines, bar: bar?.text || null, tricks });
}

// ----- money half -----

async function money(st, send) {
  const k = await keys();
  if (!k.anthropic || !worthAnalyzing(st.page)) return log(`money skipped ${st.page.domain}: key ${!!k.anthropic}, ${st.page.words} words`);
  const key = `m2:${st.page.url}`; // bump when the money prompt changes
  const hit = (await chrome.storage.local.get(key))[key];
  const out = hit && Date.now() - hit.at < 7 * 864e5 ? hit.out : await moneyBanner(st.page, k.anthropic).catch((e) => (log("money failed:", e.message.slice(0, 160)), { verdict: "error", banner: "" }));
  if (out.verdict === "error") return;
  if (!hit) await chrome.storage.local.set({ [key]: { out, at: Date.now() } });
  log(`money ${st.page.domain}: ${out.verdict}${hit ? " (cached)" : ""} ${out.banner}`);
  if (out.verdict === "tell" && out.banner) send({ type: "money", text: out.banner, passages: out.passages });
}

// ----- tabs talk over a port -----

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "tells") return;
  const tabId = port.sender.tab.id;
  const send = (msg) => { try { port.postMessage(msg); } catch {} };
  port.onDisconnect.addListener(() => { const st = tabs.get(tabId); if (st?.port === port) st.port = null; });

  port.onMessage.addListener(async (msg) => {
    if (msg.type === "page") {
      const st = tabs.get(tabId);
      if (!st) return;
      st.page = { ...msg.page, words: msg.page.words };
      return money(st, send).catch((e) => console.warn("[tells] money", e.message));
    }
    if (msg.type !== "hello") return;
    if (!tabs.has(tabId)) tabs.set(tabId, fresh(msg.page.url));
    const st = tabs.get(tabId);
    st.port = port;
    st.page = msg.page;
    const k = await keys();
    log(`hello ${st.page.domain}: ${st.page.words} words, ${st.reqs.size} requests so far, keys anthropic=${!!k.anthropic} typesafe=${!!k.typesafe}`);
    if (!k.anthropic && !k.typesafe) return send({ type: "needs-keys" });
    schedule(tabId, SETTLE);
    money(st, send).catch((e) => console.warn("[tells] money", e.message));
  });
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The installer can drop keys into config.json so nobody pastes them twice.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const have = await keys();
  if (have.anthropic || have.typesafe) return;
  const config = await fetch(chrome.runtime.getURL("config.json")).then((r) => r.json()).catch(() => null);
  if (config?.anthropicKey || config?.typesafeKey) await chrome.storage.local.set({ anthropicKey: config.anthropicKey || "", typesafeKey: config.typesafeKey || "" });
  else if (reason === "install") chrome.runtime.openOptionsPage();
});
