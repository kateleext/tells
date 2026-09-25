// The banner: one short, dry, funny line across the top that sums up the page.
// Tricks are detected in code (seen); Claude only gets to be witty about facts it's handed.

// Things a site does that make tracking harder to see or block.
export function tricksOf(companies) {
  const t = [];
  for (const c of companies) {
    const via = c.facts.find((f) => f.label === "Sent via");
    if (via && !c.blocked) t.push(`sends ${c.owner} your page through ${via.value.split(",")[0]}, its own server, so blockers miss it`);
    if (c.facts.some((f) => f.value === "hashed" && /Category|Product/.test(f.label))) t.push(`scrambles product names before handing them to ${c.owner}`);
    if (c.top.canon === "fingerprint") t.push(`${c.owner} fingerprints your browser, which works even without cookies`);
    if (c.top.canon === "relay") t.push("pipes what you do through its own tracking server, where nobody can see who it goes to next");
    if (c.top.canon === "record") t.push(`${c.owner} records your mouse and clicks`);
  }
  return t;
}

const RULES = `You write the banner for tells, a punk browser extension that shows people who is tracking them on the page they're on.

Shape: "[who] now [thinks/has you down as] [what this page implies about you]." A short kicker after it is fine if words remain.

The banner is ONE line across the top of the page, in neon. Brutal, blunt, funny, a hacker friend leaning over and saying the quiet part out loud. Max 10 words, count them. No emoji, no hashtags.

Get real about what it means HERE. Don't say "knows you opened the page". Say what the page reveals about the person, in plain street words:
- an ED treatment page -> they now have you down as maybe having ED
- a pregnancy test page -> you might be pregnant, and now ad companies think so too
- a bad-credit card page -> your credit is probably bad, and eight companies took notes
- a therapy site -> you might be looking for a therapist
Frame it as what the company can now assume ("has you down as", "thinks", "filed you under"), never as a fact about the reader.

Rules, which keep it credible:
- Only use the facts given. Real company names, real counts. Never invent what a company does with the data, never state the site's motives.
- Lead with what the companies now assume about the reader. That is the punch. A screen recording can be the punch too.
- No plumbing, ever: never mention servers, routing, cookies, hashing, pixels or how the data travels.
- Only mention a blocker if blocked_by_your_blocker is present. Never assume the reader has one. If everything was blocked, gloat on their behalf about who tried and failed.
- Mild swearing is allowed, rarely. No slurs, no body shaming. Punch at the tracking, never at the reader or their condition.
- Don't call a page visit a search.

Examples of the register (don't reuse):
"Nine ad companies now think you might be pregnant."
"Google has you down as maybe needing a divorce lawyer. Your blocker missed it."
"Clarity is filming your cursor while you shop for bad-credit cards."`;

export function bannerFacts(page, companies, siteKind) {
  const live = companies.filter((c) => !c.blocked);
  return {
    site: page.domain, page_title: page.title, site_kind: siteKind || "unknown",
    companies_that_got_data: live.length,
    what_they_got: live.slice(0, 8).map((c) => c.line),
    // only present when a blocker actually stopped something; many readers have none
    ...(companies.some((c) => c.blocked) && { blocked_by_your_blocker: companies.filter((c) => c.blocked).map((c) => c.owner) }),
  };
}

const SCHEMA = {
  type: "object",
  properties: { banner: { type: "string" } },
  required: ["banner"], additionalProperties: false,
};

// The line has to be about the reader, not the plumbing. One retry, then take what we get.
function offKey(text, facts) {
  const brand = facts.site.split(".")[0].toLowerCase();
  return !/\byou/i.test(text) || text.toLowerCase().startsWith(brand) || text.split(/\s+/).length > 13;
}

export async function writeBanner(facts, apiKey, model = "claude-sonnet-5") {
  const first = await ask(facts, apiKey, model);
  if (!offKey(first, facts)) return first;
  const second = await ask({ ...facts, rejected: first, why: "Lead with what companies now think about YOU. Don't start with the site's name. Max 10 words." }, apiKey, model).catch(() => first);
  return offKey(second, facts) ? first : second;
}

async function ask(facts, apiKey, model) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model, max_tokens: 1000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: RULES,
      messages: [{ role: "user", content: JSON.stringify(facts, null, 1) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const msg = await res.json();
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("")).banner;
}
