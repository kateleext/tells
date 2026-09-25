// Who owns a tracking domain. Suffix match on the request host.
// kind: ads | analytics | replay | fingerprint | broker | exchange | marketing | loader
// "loader" hosts only ship tracking code; the data goes elsewhere, so they make no line.

const OWNERS = [
  ["facebook.com", "Meta", "ads"], ["facebook.net", "Meta", "loader"], ["instagram.com", "Meta", "ads"],
  ["google-analytics.com", "Google", "analytics"], ["analytics.google.com", "Google", "analytics"],
  ["doubleclick.net", "Google", "ads"], ["googleadservices.com", "Google", "ads"],
  ["googlesyndication.com", "Google", "ads"], ["googletagmanager.com", "Google", "loader"],
  ["google.com/pagead", "Google", "ads"], ["google.com/ccm", "Google", "ads"],
  ["analytics.tiktok.com", "TikTok", "ads"],
  ["px.ads.linkedin.com", "LinkedIn", "ads"], ["snap.licdn.com", "LinkedIn", "loader"],
  ["bat.bing.com", "Microsoft", "ads"], ["clarity.ms", "Microsoft Clarity", "replay"],
  ["adnxs.com", "Microsoft Xandr", "exchange"],
  ["hotjar.com", "Hotjar", "replay"], ["hotjar.io", "Hotjar", "replay"],
  ["fullstory.com", "FullStory", "replay"], ["lr-ingest.io", "LogRocket", "replay"], ["lr-in.com", "LogRocket", "replay"],
  ["mouseflow.com", "Mouseflow", "replay"], ["smartlook.cloud", "Smartlook", "replay"], ["contentsquare.net", "Contentsquare", "replay"],
  ["ct.pinterest.com", "Pinterest", "ads"], ["tr.snapchat.com", "Snap", "ads"],
  ["ads-twitter.com", "X", "ads"], ["analytics.twitter.com", "X", "ads"], ["t.co", "X", "ads"],
  ["redditstatic.com", "Reddit", "loader"], ["alb.reddit.com", "Reddit", "ads"], ["pixel-config.reddit.com", "Reddit", "ads"],
  ["amazon-adsystem.com", "Amazon", "ads"],
  ["criteo.com", "Criteo", "ads"], ["criteo.net", "Criteo", "ads"],
  ["taboola.com", "Taboola", "ads"], ["outbrain.com", "Outbrain", "ads"],
  ["rubiconproject.com", "Magnite", "exchange"], ["pubmatic.com", "PubMatic", "exchange"],
  ["openx.net", "OpenX", "exchange"], ["casalemedia.com", "Index Exchange", "exchange"],
  ["rlcdn.com", "LiveRamp", "broker"], ["liveramp.com", "LiveRamp", "broker"],
  ["demdex.net", "Adobe", "broker"], ["omtrdc.net", "Adobe", "analytics"],
  ["bluekai.com", "Oracle", "broker"], ["agkn.com", "Neustar", "broker"], ["crwdcntrl.net", "Lotame", "broker"],
  ["segment.io", "Twilio Segment", "analytics"], ["segment.com", "Twilio Segment", "analytics"],
  ["mixpanel.com", "Mixpanel", "analytics"], ["amplitude.com", "Amplitude", "analytics"], ["heapanalytics.com", "Heap", "analytics"],
  ["quantserve.com", "Quantcast", "ads"], ["scorecardresearch.com", "Comscore", "analytics"],
  ["klaviyo.com", "Klaviyo", "marketing"], ["hs-analytics.net", "HubSpot", "marketing"], ["hubspot.com", "HubSpot", "marketing"],
  ["adsrvr.org", "The Trade Desk", "ads"], ["matomo.cloud", "Matomo", "analytics"],
  ["px-cloud.net", "HUMAN", "fingerprint"], ["px-client.net", "HUMAN", "fingerprint"],
  ["posthog.com", "PostHog", "analytics"], ["freshpaint-impression.com", "Freshpaint", "marketing"], ["freshpaint.io", "Freshpaint", "marketing"],
  ["tiqcdn.com", "Tealium", "loader"],
  ["tvsquared.com", "Innovid TVSquared", "ads"],
  ["yahoo.com", "Yahoo", "ads"], ["tapad.com", "Tapad", "broker"], ["id5-sync.com", "ID5", "broker"],
];

export function ownerOf(url) {
  const u = new URL(url);
  const hostPath = u.hostname + u.pathname;
  for (const [suffix, owner, kind] of OWNERS) {
    if (suffix.includes("/")) { if (hostPath.startsWith(suffix) || hostPath.includes("." + suffix)) return { owner, kind }; continue; }
    if (u.hostname === suffix || u.hostname.endsWith("." + suffix)) return { owner, kind };
  }
  return null;
}

// Rough registrable domain ("shop.example.co.uk" -> "example.co.uk"), good enough for first-party checks.
export function siteOf(host) {
  const p = host.replace(/^www\./, "").split(".");
  const n = p.length >= 3 && p.at(-1).length === 2 && p.at(-2).length <= 3 ? 3 : 2;
  return p.slice(-n).join(".");
}
