// Deterministic: one network request in, zero or more tracking events out.
// An event is what a company was told, decoded from the pixel payload:
//   { owner, kind, canon, name, item, search, value, currency, facts: [{label, value}] }
// canon is the normalized action; name is the raw event name the site sent.

import { ownerOf } from "./trackers.js";

// Weakest to strongest. A company's line shows its strongest event.
export const RANK = ["visit", "custom", "fingerprint", "relay", "view", "search", "signup", "book", "add_to_cart", "checkout", "purchase", "record"];

const META = {
  PageView: "visit", ViewContent: "view", Search: "search", AddToWishlist: "view", AddToCart: "add_to_cart",
  InitiateCheckout: "checkout", AddPaymentInfo: "checkout", Purchase: "purchase", Lead: "signup",
  CompleteRegistration: "signup", Subscribe: "signup", StartTrial: "signup", Contact: "signup",
  SubmitApplication: "signup", Schedule: "book", FindLocation: "search", Donate: "purchase", CustomizeProduct: "view",
};
const GA4 = {
  page_view: "visit", view_item: "view", view_item_list: "view", select_item: "view", search: "search",
  view_search_results: "search", add_to_cart: "add_to_cart", add_to_wishlist: "view", begin_checkout: "checkout",
  add_payment_info: "checkout", add_shipping_info: "checkout", purchase: "purchase", sign_up: "signup",
  generate_lead: "signup", login: "signup",
  // engagement noise: counts as a visit
  scroll: "visit", user_engagement: "visit", first_visit: "visit", session_start: "visit", click: "visit",
  form_start: "visit", form_submit: "signup", video_start: "visit", video_progress: "visit", file_download: "visit",
};
const TIKTOK = {
  Pageview: "visit", LandingPageView: "visit", EngagedSession: "visit", ViewContent: "view", ClickButton: "visit", Search: "search", AddToCart: "add_to_cart",
  AddToWishlist: "view", InitiateCheckout: "checkout", AddPaymentInfo: "checkout", PlaceAnOrder: "purchase",
  CompletePayment: "purchase", SubmitForm: "signup", CompleteRegistration: "signup", Contact: "signup", Subscribe: "signup",
};
const PINTEREST = { init: "visit", pagevisit: "visit", page_visit: "visit", viewcategory: "view", search: "search", addtocart: "add_to_cart", checkout: "purchase", lead: "signup", signup: "signup" };

const canonOf = (map, name) => map[name] || (name ? "custom" : "visit");

function paramsOf(url, body) {
  const p = new Map(new URL(url).searchParams);
  if (body && !/^\s*[\[{]/.test(body)) for (const [k, v] of new URLSearchParams(body)) p.set(k, v);
  return p;
}
const jsonOf = (s) => { try { return JSON.parse(s); } catch { return null; } };
const num = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
const pathOf = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname; } catch { return null; } };

const HASH = /^[a-f0-9]{32,}$/i;
const unhash = (f) => (HASH.test(f.value) ? { ...f, value: "hashed" } : f);

function event(who, canon, name, { item = null, search = null, value = null, currency = null, facts = [] } = {}) {
  if (item && HASH.test(item)) item = null;
  const f = [];
  if (item) f.push({ label: "Product", value: item });
  if (search) f.push({ label: "Search", value: search });
  if (value != null) f.push({ label: "Amount", value: `${value}${currency ? " " + currency : ""}` });
  const page = facts.find((x) => x.label === "Page address")?.value || null;
  return { ...who, canon, name, item, search, value, currency, page, facts: [...f, ...facts].map(unhash) };
}

function meta(who, p) {
  const name = p.get("ev");
  if (!name) return [];
  const contents = jsonOf(p.get("cd[contents]") || "");
  const item = p.get("cd[content_name]") || contents?.[0]?.item_name || null;
  const facts = [];
  if (p.get("dl")) facts.push({ label: "Page address", value: pathOf(p.get("dl")) });
  if (p.get("cd[content_category]")) facts.push({ label: "Category", value: p.get("cd[content_category]") });
  if (p.get("cd[content_ids]")) facts.push({ label: "Product IDs", value: p.get("cd[content_ids]") });
  if (p.get("fbp")) facts.push({ label: "Browser ID", value: "_fbp cookie" });
  if (p.get("ud[em]") || p.get("udff[em]")) facts.push({ label: "Your email", value: "hashed" });
  if (p.get("ud[ph]") || p.get("udff[ph]")) facts.push({ label: "Your phone", value: "hashed" });
  if (p.get("ud[external_id]") || p.get("udff[external_id]")) facts.push({ label: "Site's ID for you", value: "external_id" });
  return [event(who, canonOf(META, name), name, {
    item, search: p.get("cd[search_string]"), value: num(p.get("cd[value]")), currency: p.get("cd[currency]"), facts,
  })];
}

// GA4 batches events: shared params in the URL, one event per body line.
function ga4(who, url, body) {
  const shared = new URL(url).searchParams;
  const lines = body ? body.split(/\r?\n/).filter(Boolean) : [""];
  return lines.map((line) => {
    const p = new Map([...shared, ...new URLSearchParams(line)]);
    const name = p.get("en");
    const prod = [...p.keys()].filter((k) => /^pr\d+$/.test(k)).map((k) => Object.fromEntries(p.get(k).split("~").map((s) => [s.slice(0, 2), s.slice(2)])));
    const facts = [];
    if (p.get("dl")) facts.push({ label: "Page address", value: pathOf(p.get("dl")) });
    if (p.get("dt")) facts.push({ label: "Page title", value: p.get("dt") });
    if (p.get("cid")) facts.push({ label: "Browser ID", value: "_ga cookie" });
    if (p.get("uid")) facts.push({ label: "Your account ID", value: "on this site" });
    return event(who, canonOf(GA4, name), name, {
      item: prod[0]?.nm || null,
      search: p.get("ep.search_term") || null,
      value: num(p.get("epn.value") ?? p.get("ep.value")),
      currency: p.get("cu"),
      facts,
    });
  }).filter((e) => e.name);
}

function tiktok(who, body) {
  const j = jsonOf(body);
  if (!j) return [];
  return (j.batch || [j]).filter((e) => e.event).map((e) => {
    const props = e.properties || {};
    const user = e.context?.user || {};
    const facts = [];
    if (e.context?.page?.url) facts.push({ label: "Page address", value: pathOf(e.context.page.url) });
    if (user.email) facts.push({ label: "Your email", value: "hashed" });
    if (user.phone_number) facts.push({ label: "Your phone", value: "hashed" });
    if (user.external_id) facts.push({ label: "Your account ID", value: "on this site" });
    if (e.context?.ad?.callback) facts.push({ label: "TikTok click ID", value: "ttclid" });
    return event(who, canonOf(TIKTOK, e.event), e.event, {
      item: props.content_name || props.contents?.[0]?.content_name || null,
      search: props.query || null, value: num(props.value), currency: props.currency || null, facts,
    });
  });
}

function pinterest(who, p) {
  const name = p.get("event");
  if (!name) return [];
  const ed = jsonOf(p.get("ed") || "") || {};
  const pd = jsonOf(p.get("pd") || "") || {};
  const facts = pd.em ? [{ label: "Your email", value: "hashed" }] : [];
  return [event(who, canonOf(PINTEREST, name), name, {
    item: ed.line_items?.[0]?.product_name || null, search: ed.search_query || null,
    value: num(ed.value), currency: ed.currency || null, facts,
  })];
}

export function decode({ url, body = "" }) {
  let u;
  try { u = new URL(url); } catch { return []; }
  // GA4 also runs through first-party "server-side" endpoints; the path gives it away.
  const isGa4 = /\/g\/collect$/.test(u.pathname) && u.searchParams.has("tid");
  const who = ownerOf(url) || (isGa4 ? { owner: "Google", kind: "analytics" } : null);
  if (!who || who.kind === "loader") return [];

  if (isGa4) return ga4(who, url, body);
  if (who.owner === "Meta" && /^\/tr\/?$/.test(u.pathname)) return meta(who, paramsOf(url, body));
  if (who.owner === "TikTok" && u.pathname.startsWith("/api/v2/pixel")) return tiktok(who, body);
  if (who.owner === "Pinterest") return pinterest(who, paramsOf(url, body));
  if (who.kind === "replay") return [event(who, "record", "session recording")];
  if (who.kind === "fingerprint") return [event(who, "fingerprint", "browser fingerprint")];
  // Known company, no decoder: it at least learned you were here.
  return [event(who, "visit", "")];
}

// A site's own collection endpoint (server-side tagging). What happens next is
// invisible from the browser, which is the point of it, so say only that it exists.
const OWN_TRACKER = /^(events?|collect(or)?|track(ing|er)?|metrics|analytics|sst?|sgtm|tags?|data|tr|t)\.|\/(collect|track|events?|beacon|pixel|tr)\/?$/i;
export function ownTracker({ url, method }) {
  const u = new URL(url);
  if (method !== "POST" && !u.search) return [];
  if (!OWN_TRACKER.test(u.hostname) && !OWN_TRACKER.test(u.pathname)) return [];
  return [event({ owner: "This site", kind: "firstparty" }, "relay", "own tracker", { facts: [{ label: "Sent to", value: u.hostname + u.pathname }] })];
}
