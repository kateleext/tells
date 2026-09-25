// In-page: send the page to the worker, then show one banner across the top:
//   [spyglass] what trackers got  •  [$] who profits
// Each half arrives on its own. Clicking a half opens its details underneath.

import { extractPage } from "../../agent/extract.js";
import CSS from "./banner.css";

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const ICON = {
  spy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9h20"/><path d="M3 9l1 5.5a3 3 0 0 0 3 2.5h1.5a3 3 0 0 0 3-2.6L11.7 12h.6l.2 2.4a3 3 0 0 0 3 2.6H17a3 3 0 0 0 3-2.5L21 9"/></svg>`,
  money: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"/><path d="M17 6.5c-1-1.5-2.8-2.5-5-2.5-2.8 0-5 1.5-5 3.8 0 5.2 10.2 3 10.2 8.4 0 2.4-2.3 3.8-5.2 3.8-2.3 0-4.3-1-5.3-2.7"/></svg>`,
};

function start() {
  const page = extractPage(document, location.href);
  const port = chrome.runtime.connect({ name: "tells" });
  const ping = setInterval(() => port.postMessage({ type: "ping" }), 20000);
  port.onDisconnect.addListener(() => clearInterval(ping));
  const ui = createUI();
  port.onMessage.addListener((msg) => {
    console.info(`[tells] ${msg.type}${msg.text ? `: ${msg.text}` : ""}`);
    if (msg.type === "needs-keys") return console.info("[tells] Add your API keys in the extension options.");
    ui.set(msg.type, msg);
  });
  port.postMessage({ type: "hello", page });
  console.info(`[tells] hello ${page.domain}, ${page.words} words`);
  // JS-rendered articles aren't there yet at document_end; read again once loaded
  if (page.words < 250) {
    const again = () => setTimeout(() => {
      const later = extractPage(document, location.href);
      console.info(`[tells] re-read ${later.words} words`);
      if (later.words > page.words) port.postMessage({ type: "page", page: later });
    }, 1500);
    document.readyState === "complete" ? again() : addEventListener("load", again, { once: true });
  }
}

function createUI() {
  const halves = { track: null, money: null };
  const order = [];      // arrival order: whatever came first stays first
  let open = null;       // "track" | "money" | null
  let dismissed = false;
  let host, bar, drawer;
  const marks = [];

  function mount() {
    host = document.createElement("tells-banner");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="bar" role="status"></div><div class="drawer"></div></div>`;
    bar = root.querySelector(".bar");
    drawer = root.querySelector(".drawer");
    root.addEventListener("click", onClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") open ? toggle(null) : dismiss(); });
    document.body.prepend(host);
    const wrap = root.querySelector(".wrap");
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("in")));
    // In the flow at the top (pushes the page down); once scrolled past, pin it to the window.
    // The host keeps the bar's height so the page doesn't jump when it pins.
    const pin = () => {
      const h = bar.offsetHeight;
      const stuck = host.getBoundingClientRect().top < 0;
      host.style.height = stuck ? `${h}px` : "";
      wrap.classList.toggle("stuck", stuck);
    };
    addEventListener("scroll", pin, { passive: true });
    new ResizeObserver(pin).observe(bar);
  }

  function set(kind, msg) {
    if (kind === "track-rows") {
      // same line, fresher details
      if (!halves.track || dismissed) return;
      Object.assign(halves.track, { lines: msg.lines, bar: msg.bar, tricks: msg.tricks });
      return open === "track" && renderDrawer();
    }
    if (dismissed || !(kind in halves)) return;
    const fresh = !halves[kind] || halves[kind].text !== msg.text;
    halves[kind] = msg;
    if (!order.includes(kind)) order.push(kind);
    if (!host) mount();
    render(fresh ? kind : null);
  }

  function render(changed) {
    const segs = order.map((k) => k === "track"
      ? seg("track", halves.track.tone === "safe" ? "spy safe" : "spy", ICON.spy, halves.track.text)
      : seg("money", "money", ICON.money, halves.money.text));
    bar.innerHTML = `<p class="line">${segs.join(`<span class="dot" aria-hidden="true"></span>`)}</p><button class="x" aria-label="Dismiss">×</button>`;
    bar.classList.toggle("safe", halves.track?.tone === "safe" && !halves.money);
    if (changed) bar.querySelector(`[data-k="${changed}"]`)?.classList.add("new");
    renderDrawer();
  }

  const seg = (k, cls, icon, text) =>
    `<button class="seg ${cls} ${open === k ? "on" : ""}" data-k="${k}" aria-expanded="${open === k}">` +
    `<span class="ic">${icon}</span><span class="t">${esc(text)}</span></button>`;

  function renderDrawer() {
    drawer.classList.toggle("open", !!open);
    if (!open) return (drawer.innerHTML = "");
    if (open === "track") {
      const h = halves.track;
      drawer.innerHTML = `
        <ul class="rows">${h.lines.map((l) => `<li><span class="n">${esc(l.text)}</span>${l.sensitivity != null ? `<span class="lvl" style="--s:${Math.min(1, l.sensitivity / 3)}"></span>` : ""}<span class="ev">seen</span></li>`).join("")}</ul>
        ${h.tricks?.length ? `<div class="label">Making it hard to see</div><ul class="rows tricks">${h.tricks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${h.bar ? `<div class="green">${esc(h.bar)}</div>` : ""}`;
    } else {
      const h = halves.money;
      drawer.innerHTML = `<div class="label">On this page</div><ul class="rows quotes">${h.passages.map((q) => `<li>“${esc(q)}”</li>`).join("") || "<li>No quotes pulled.</li>"}</ul>`;
    }
  }

  function onClick(e) {
    const path = e.composedPath();
    if (path.some((n) => n.classList?.contains("x"))) return dismiss();
    const s = path.find((n) => n.classList?.contains("seg"));
    if (s) toggle(open === s.dataset.k ? null : s.dataset.k);
  }

  function toggle(k) {
    open = k;
    unmark();
    if (k === "money") {
      for (const q of halves.money.passages) marks.push(...wrapQuote(q));
      marks[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    render(null);
  }

  function dismiss() {
    dismissed = true;
    unmark();
    host?.shadowRoot.querySelector(".wrap").classList.remove("in");
    setTimeout(() => host?.remove(), 450);
  }

  function unmark() {
    for (const m of marks.splice(0)) m.replaceWith(...m.childNodes);
  }

  return { set };
}

// Find a quote in the page text (whitespace and quote-mark tolerant) and wrap it in <mark>s.
function wrapQuote(quote) {
  const norm = (s) => s.replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, "-").toLowerCase();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("script,style,noscript,textarea,tells-banner") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let hay = "", map = [], lastSpace = true, node;
  while ((node = walker.nextNode())) {
    const v = node.nodeValue;
    for (let i = 0; i < v.length; i++) {
      const space = /\s/.test(v[i]);
      if (space && lastSpace) continue;
      hay += space ? " " : norm(v[i]);
      map.push([node, i]);
      lastSpace = space;
    }
  }
  const needle = norm(quote).replace(/\s+/g, " ").trim();
  const at = hay.indexOf(needle);
  if (at < 0 || !needle) return [];
  const segments = new Map();
  for (let k = at; k < at + needle.length; k++) {
    const [n, off] = map[k];
    const seg = segments.get(n) || [off, off];
    seg[1] = off;
    segments.set(n, seg);
  }
  const out = [];
  for (const [n, [s, e]] of segments) {
    const range = document.createRange();
    range.setStart(n, s);
    range.setEnd(n, e + 1);
    const mark = document.createElement("mark");
    mark.style.cssText = "background:#FFE58A;color:inherit;border-radius:2px;";
    try { range.surroundContents(mark); out.push(mark); } catch {}
  }
  return out;
}

if (window.top === window && !window.__tells) {
  window.__tells = true;
  start();
}
