// The money banner: who profits if you believe this page, in ten words.
// Same credibility rules as tell's card, shorter output, plus a few verbatim
// passages so clicking the banner can light up the evidence on the page.

const RULES = `You are tells, a browser companion that shows readers who profits if they believe the page they're reading.

You write the MONEY half of a neon banner across the top of the page. Brutal, blunt, funny, a hacker friend saying the quiet part out loud. Max 10 words, count them. No emoji. Get real about what it means for the reader here: the ranking is paid for, the review is the seller, the expert owns the stock.

Rules, which are the product's credibility:
- Only state what is SEEN on the page (affiliate links, disclosures, bylines, sponsor labels, the domain itself). Nothing else. Never infer commission rates, dollar amounts, or motives. No "biased", no "shill", no "likely", no "probably": if a stake is not shown on the page, describe only what is shown.
- verdict "tell": someone with a material financial stake is behind or shaping the page (affiliate commissions, the seller writing its own review, sponsored content, a funded think tank arguing for its funders' industry, an author with a stake). "minor": only donation links, generic ads, or a company plainly selling its own product on its own site (that's obvious, not hidden) unless the page dresses up as independent: paid testimonials, "unbiased" comparisons against competitors, expert or doctor content that funnels into its own product. "quiet": nothing material. Neutral reference pages, government statistics and hobby blogs are usually quiet.
- banner: empty unless verdict is "tell". Specific and checkable. Funny comes from bluntness and juxtaposition. Mild swearing allowed, rarely. Punch at the money, never at the reader.
- passages: up to 3 short quotes (under 25 words) copied VERBATIM from the page text, character for character, that show the money. Empty when quiet.

Examples of the register (don't reuse):
"Every pick here pays them when you buy."
"The mattress reviewers sell mattresses. Sleep on that."
"Oil money wrote this. Surprise: oil is great."`;

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["tell", "minor", "quiet"] },
    banner: { type: "string" },
    passages: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "banner", "passages"],
  additionalProperties: false,
};

function pageBlock(page, maxChars = 20000) {
  return [
    `URL: ${page.url}`, `Domain: ${page.domain}`, `Title: ${page.title}`,
    page.siteName && `Site name: ${page.siteName}`,
    page.byline && `Byline: ${page.byline}`,
    page.links && `Links: ${page.links.total} total, ${page.links.affiliate} through affiliate networks${page.links.affiliateHosts.length ? ` (${page.links.affiliateHosts.join(", ")})` : ""}. Outbound CTAs: ${page.links.ctas.slice(0, 12).join(" | ") || "none"}`,
    page.disclosures?.length && `Disclosure-like sentences:\n- ${page.disclosures.join("\n- ")}`,
    `Page text:\n"""\n${page.text.slice(0, maxChars)}\n"""`,
  ].filter(Boolean).join("\n");
}

export async function moneyBanner(page, apiKey, model = "claude-sonnet-5") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model, max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: RULES, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: pageBlock(page) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const msg = await res.json();
  if (msg.stop_reason === "refusal") throw new Error("Model declined this page");
  const out = JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  if (out.verdict !== "tell") out.banner = "";
  return out;
}
