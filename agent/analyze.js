// Captured requests for one page -> companies with their lines. Pure and deterministic.

import { decode, ownTracker } from "./decode.js";
import { group, lineFor } from "./lines.js";
import { siteOf } from "./trackers.js";

export function analyze(page, reqs) {
  const first = siteOf(page.domain);
  const events = reqs.flatMap((r) => {
    let host;
    try { host = new URL(r.url).hostname; } catch { return []; }
    const evs = decode(r).map((e) => ({ ...e, blocked: r.outcome === "blocked" }));
    // first-party requests only count when a decoder recognised them (server-side GA4)
    if (siteOf(host) !== first) return evs;
    return evs.length ? evs : ownTracker(r);
  });
  const companies = group(events).map((c) => ({ ...c, line: lineFor(c).text }));
  return { events, companies };
}
