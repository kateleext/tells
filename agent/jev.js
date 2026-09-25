// One Jev call per page: what kind of site this is, how sensitive each
// company's haul is here, and what custom event names mean. Parallel questions.

import { RANK } from "./decode.js";

const SITE_KINDS = {
  health: "Medical conditions, symptoms, pharmacies, clinics, prescription drugs, hospitals, health insurance",
  reproductive: "Pregnancy, fertility, contraception, abortion, sexual health, STI testing, period tracking",
  mental_health: "Mental health, therapy, addiction, recovery, crisis support",
  finance: "Banking, loans, debt, credit scores, payday lending, investing, tax",
  dating: "Dating apps, relationships, LGBTQ+ community",
  kids: "Made for children, or about specific children",
  beliefs: "Religious groups, political campaigns, advocacy, unions",
  legal: "Legal help, immigration, criminal records, bail, divorce",
  jobs: "Job search, careers, applicant portals",
  shopping: "Online stores and product pages not covered above",
  news_media: "News, magazines, blogs, video, entertainment",
  other: "Anything else",
};

const SENSITIVITY = [
  "Nothing personal: an ordinary visit to an ordinary page, like a news article or a store homepage.",
  "Mildly personal: everyday shopping or reading interests, like looking at shoes or a recipe.",
  "Personal: money, location, identity, or habits a person might not want profiled, like a loan comparison or linking the visit to their email.",
  "Sensitive: reveals or strongly implies health, pregnancy, sexuality, mental health, religion, politics, immigration status, or financial trouble.",
];

const VERBS = Object.fromEntries(RANK.filter((c) => !["custom", "record"].includes(c)).map((c) => [c, {
  visit: "just viewed or scrolled the page", view: "looked at a specific product or item", search: "searched for something",
  signup: "submitted a form, signed up, or logged in", book: "booked an appointment", add_to_cart: "added something to a cart",
  checkout: "started checking out", purchase: "paid for something",
}[c]]));
VERBS.unclear = "Can't tell from the name";

export function questionsFor(page, companies) {
  const state = {
    page: { domain: page.domain, title: page.title, description: page.description || "" },
    companies: companies.map((c) => ({
      company: c.owner, kind: c.kind, event_names: c.names, told: c.facts.map((f) => `${f.label}: ${f.value}`),
    })),
  };
  const questions = {
    site_kind: { type: "choice", instructions: "What kind of website is `page`? Judge from its domain, title and description.", criteria: SITE_KINDS },
  };
  companies.forEach((c, i) => {
    questions[`sens_${i}`] = {
      type: "score",
      instructions: `\`companies[${i}]\` is a tracking company that received data from this page. Given what kind of site \`page\` is and what \`companies[${i}].told\` and \`companies[${i}].event_names\` show, how sensitive is what this company just learned about the person? A plain visit to a clinic, a loan page, or a pregnancy product is itself sensitive.`,
      criteria: SENSITIVITY,
    };
    if (c.top.canon === "custom") questions[`verb_${i}`] = {
      type: "choice",
      instructions: `A website sent the custom tracking event "${c.top.name}" to ${c.owner}. What did the person most likely just do?`,
      criteria: VERBS,
    };
  });
  return { state, questions };
}

export async function classify(page, companies, apiKey) {
  const { state, questions } = questionsFor(page, companies);
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
  const { answers } = await res.json();
  return {
    siteKind: answers.site_kind.choice,
    siteKindConfidence: answers.site_kind.confidence,
    companies: companies.map((_, i) => ({
      sensitivity: answers[`sens_${i}`].score,
      verb: answers[`verb_${i}`]?.choice === "unclear" ? null : answers[`verb_${i}`]?.choice || null,
    })),
  };
}
