// Reads a DOM document into the page payload the agent sees. Runs in the
// content script on the live page and in the eval runner on fetched HTML.

const AFFILIATE = [
  /[?&](tag|ref|aff|affid|affiliate|aff_id|partner|irclickid|clickid|subid|utm_medium=affiliate)=/i,
  /(^|\.)(amzn\.to|go\.skimresources\.com|go\.redirectingat\.com|skimlinks\.com|click\.linksynergy\.com|linksynergy\.com|anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|tkqlhce\.com|kqzyfj\.com|awin1\.com|shareasale\.com|impact\.com|sjv\.io|pxf\.io|7eer\.net|ojrq\.net|howl\.me|shopstyle\.it|rstyle\.me|narrativ\.com|bam-x\.com|avantlink\.com|pntra\.com|prf\.hn|partnerize\.com|fatcoupon|cj\.com|clkmg\.com|go\.magik\.ly|shop-links\.co|fave\.co|geni\.us|linkby\.com|dealsapi|bankrate\.com\/.*redirect)/i,
];
const CTA = /^(check price|see price|view (deal|offer|price)|buy( now)?|shop( now)?|get (it|deal|offer|started)|apply( now)?|learn more|sign up|open (an )?account|start (free )?trial|see (it|deal|offer)|visit site|claim offer)/i;
const DISCLOSURE = /(commission|affiliate|sponsor|paid (partnership|post|content|for by)|partner offer|advertis|we may earn|compensat|disclos|funded by|brought to you by|in partnership with|content from|brand ?studio|has a position|owns shares|holdings|financial interest|conflict of interest|fellow at|board of directors)/i;
const BLOCK = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "BLOCKQUOTE", "TR", "BR", "HEADER", "FOOTER", "FIGCAPTION", "DT", "DD", "PRE"]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEMPLATE", "IFRAME", "BUTTON", "SELECT", "TELLS-BANNER"]);
const MAX_TEXT = 48000;

export function textOf(root) {
  let out = "";
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
    if (n.getAttribute?.("aria-hidden") === "true" || n.hidden) return;
    const block = BLOCK.has(n.tagName);
    if (block) out += "\n";
    for (const c of n.childNodes) walk(c);
    if (block) out += "\n";
  };
  walk(root);
  return out.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

const meta = (doc, ...names) => {
  for (const n of names) {
    const el = doc.querySelector(`meta[name="${n}"], meta[property="${n}"]`);
    if (el?.getAttribute("content")) return el.getAttribute("content").trim();
  }
  return "";
};

export function extractPage(doc, url) {
  const u = new URL(url);
  const domain = u.hostname.replace(/^www\./, "");
  const main = doc.querySelector("article") || doc.querySelector("main, [role=main]") || doc.body;
  let text = textOf(main);
  // the first <article> is sometimes a teaser card; fall back when it holds a sliver of the page
  if (main !== doc.body && (text.length < 600 || text.length < textOf(doc.body).length * 0.25)) text = textOf(doc.body);
  const truncated = text.length > MAX_TEXT;
  if (truncated) text = text.slice(0, MAX_TEXT);

  const bylineEl = doc.querySelector('[rel="author"], [itemprop="author"], .byline, .author, [class*="byline"], [class*="author-name"]');
  const byline = meta(doc, "author", "article:author", "parsely-author", "sailthru.author") || bylineEl?.textContent?.trim().replace(/\s+/g, " ").slice(0, 160) || "";

  let total = 0, affiliate = 0;
  const hosts = new Set(), ctas = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    let h;
    try { h = new URL(a.getAttribute("href"), url); } catch { continue; }
    if (!/^https?:$/.test(h.protocol)) continue;
    total++;
    const external = h.hostname.replace(/^www\./, "") !== domain;
    const isAff = AFFILIATE.some(re => re.test(h.href) || re.test(h.hostname));
    if (isAff && external) { affiliate++; hosts.add(h.hostname.replace(/^www\./, "")); }
    const label = a.textContent.trim().replace(/\s+/g, " ");
    if (external && CTA.test(label) && ctas.length < 30) ctas.push(`${label.slice(0, 40)} → ${h.hostname.replace(/^www\./, "")}`);
  }

  const whole = textOf(doc.body);
  const disclosures = [];
  for (const s of whole.split(/(?<=[.!?])\s+|\n/)) {
    if (s.length > 20 && s.length < 400 && DISCLOSURE.test(s) && !disclosures.includes(s.trim())) disclosures.push(s.trim());
    if (disclosures.length >= 14) break;
  }

  return {
    url,
    domain,
    title: doc.title?.trim() || meta(doc, "og:title"),
    siteName: meta(doc, "og:site_name", "application-name"),
    byline,
    published: meta(doc, "article:published_time", "datePublished", "date", "pubdate"),
    links: { total, affiliate, affiliateHosts: [...hosts].slice(0, 10), ctas },
    disclosures,
    text,
    truncated,
    words: text.split(/\s+/).length,
  };
}

// Cheap gate so the agent only runs on pages that read like content.
export function worthAnalyzing(page) {
  if (!/^https?:/.test(page.url)) return false;
  if (/(^|\.)(google|bing|duckduckgo)\.[a-z.]+$/.test(page.domain) && /\/search/.test(page.url)) return false;
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(page.domain)) return false;
  return page.words >= 250;
}
