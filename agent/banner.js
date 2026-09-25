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

const RULES = `You write the banner for a browser extension that shows people who is tracking them on the page they're on.

The banner is ONE line across the top of the page: dry, punchy, a little funny, like a friend leaning over and muttering the truth. Max 12 words. No emoji, no hashtags, no exclamation marks.

Rules, which keep it credible:
- Only use the facts given. Name real companies and real counts. Never invent what a company does with data, never state motives.
- Funny comes from juxtaposition and understatement, not insults. Punch at the practice, not at the reader.
- If the site is making tracking harder to see or block (tricks), that is usually the best joke.
- If a blocker stopped most of it, it's fine to be reassuring.
- If there's nothing much, say so plainly and briefly.
- Be exact about the action: opening a page is not a search. Say "looking at", "reading about", "on", unless the facts show a search, cart, or purchase.
- No loaded words (sneaky, shady, creepy, spying). Let the facts be damning.
- Never mock the reader, their interests, or the page's content. The joke is on the tracking.

Examples of the register (don't reuse):
"Your pregnancy test page has 9 new admirers."
"Eleven companies came to watch you compare credit cards."
"Meta got the product names scrambled. Google got the page anyway."`;

export function bannerFacts(page, companies, siteKind) {
  const live = companies.filter((c) => !c.blocked);
  return {
    site: page.domain, page_title: page.title, site_kind: siteKind || "unknown",
    companies_that_got_data: live.length,
    what_they_got: live.slice(0, 8).map((c) => c.line),
    blocked_by_your_blocker: companies.filter((c) => c.blocked).map((c) => c.owner),
    tricks: tricksOf(companies),
  };
}

const SCHEMA = {
  type: "object",
  properties: { banner: { type: "string" } },
  required: ["banner"], additionalProperties: false,
};

export async function writeBanner(facts, apiKey, model = "claude-sonnet-5") {
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
