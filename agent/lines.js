// Events -> one short line per company: "{Owner} knows you {did what}."
// Code writes every word; judgments only pick verbs and order.

import { RANK } from "./decode.js";

const clip = (s, n = 30) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const money = (v, cur) => (cur === "USD" || !cur ? `$${v}` : `${v} ${cur}`);

export function group(events) {
  const by = new Map();
  for (const e of events) {
    if (!by.has(e.owner)) by.set(e.owner, []);
    by.get(e.owner).push(e);
  }
  return [...by].map(([owner, all]) => {
    // only what got through counts; a company whose every request was blocked keeps its attempts, flagged
    const through = all.filter((e) => !e.blocked);
    const blocked = !through.length;
    const evs = blocked ? all : through;
    // strongest event wins; among equals, prefer one that names something
    const top = evs.reduce((a, b) => {
      const d = RANK.indexOf(b.canon) - RANK.indexOf(a.canon);
      return d > 0 || (d === 0 && !a.item && !a.search && (b.item || b.search)) ? b : a;
    });
    const seen = new Set();
    const facts = evs.flatMap((e) => e.facts).filter((f) => !seen.has(f.label + f.value) && seen.add(f.label + f.value));
    const names = [...new Set(evs.map((e) => e.name).filter(Boolean))];
    return { owner, kind: evs[0].kind, top, facts, names, events: evs, blocked, blockedCount: all.length - through.length };
  });
}

// verb: canon override from Jev for custom event names.
export function lineFor(company, verb) {
  const { owner, top } = company;
  const canon = top.canon === "custom" ? verb || "custom" : top.canon;
  const item = top.item && clip(top.item);
  const q = top.search && clip(top.search, 24);
  const amt = top.value != null && money(top.value, top.currency);
  const L = (text, key = "") => ({ text: `${owner} ${text}`, key });
  switch (canon) {
    case "record": return L("is recording your screen.");
    case "fingerprint": return L("is fingerprinting your browser.");
    case "relay": return L("sends what you do to its own tracker.");
    case "purchase": return item ? L(`knows you bought ${item}.`, item) : amt ? L(`knows you spent ${amt}.`, amt) : L("knows you bought something.");
    case "checkout": return amt ? L(`knows you're checking out ${amt}.`, amt) : L("knows you started checkout.");
    case "add_to_cart": return item ? L(`knows you added ${item} to cart.`, item) : L("knows you added something to cart.");
    case "book": return L("knows you booked an appointment.");
    case "signup": return L("knows you filled in a form.");
    case "search": return q ? L(`knows you searched ${q}.`, q) : L("knows what you searched.");
    case "custom": return L(`got "${clip(top.name, 24)}" from this page.`);
    case "view": if (item) return L(`knows you looked at ${item}.`, item); // else: say which page
    default: {
      const page = company.events?.map((e) => e.page).find((p) => p && p.includes("/") && !p.endsWith("/")) || null;
      return page ? L(`knows you opened ${clip(page, 40)}.`, clip(page, 40)) : L("knows you're on this site.");
    }
  }
}

// Companies whose every request was blocked collapse into one reassuring bar.
export function blockedBar(companies, blocker = "Your blocker") {
  const names = companies.filter((c) => c.blocked).map((c) => c.owner);
  if (!names.length) return null;
  const who = names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " and $1") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  return { text: `${who} tried. ${blocker} got your back.`, names };
}
