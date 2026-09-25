# tells

**A brutally honest tracker of everything hidden from you.**

A neon banner across the top of the page that says the quiet part out loud:

> 🕶 Four ad companies now have you down as maybe pregnant. • $ Every 'Shop Now' button pays this reviewer a commission.

Two halves, whichever is ready first shows first:

- **🕶 Who's watching.** Every request the page makes is decoded: Meta Pixel, GA4, TikTok, Pinterest, session recorders, fingerprinters, data brokers. It reads what they were actually sent (the product you added to cart, the page you opened, your hashed email). Then it says what that means *on this page*: an ED page tells Google you might have ED.
- **$ Who profits.** Affiliate links, sponsored content, the seller reviewing itself, the author who owns the stock.

Click a half to open the receipts: every company and what it got, the tricks used to hide it, and the quotes on the page that give the money away.

**It doesn't lie to you in either direction.**
- Everything is either *seen* in network traffic or *seen* on the page.
- When your ad blocker stops something, the banner says so ("Meta, Criteo and 8 more tried. Your blocker got your back.").
- When a site routes tracking through its own server so blockers miss it, it says that too.
- It stays quiet on pages with nothing worth saying.

#punksoftware

## How it works

```
every request ─► decode pixels (code) ─► Jev: what kind of site, how sensitive is this? (~200ms)
                                          └─► Claude: one brutal line about what it means for you
page text ─────► Claude: who profits, in ten words, with quotes as receipts
```

- `agent/decode.js`: pixel decoders. Deterministic, no model.
- `agent/trackers.js`: which company owns which tracking domain.
- `agent/jev.js`: [TypeSafe Jev](https://docs.typesafe.ai). Site kind plus per-company sensitivity, in one parallel call. It decides whether the banner speaks at all.
- `agent/banner.js`, `agent/money.js`: the two lines (Claude Sonnet 5).
- `extension/`: Chrome MV3. It watches requests with `webRequest` and marks each one sent or blocked.

## Install (Mac, Chrome)

```sh
curl -fsSL https://raw.githubusercontent.com/kateleext/tells/master/install.sh | sh
```

The installer downloads the extension and asks for your two keys: an [Anthropic API key](https://console.anthropic.com/settings/keys) and a [TypeSafe API key](https://typesafe.ai). They stay on your Mac. Then it walks you through **Load unpacked** in `chrome://extensions`. Arc, Edge and Dia work too.

Or build it yourself: `npm install && npm run build`, then load `extension/` unpacked and paste your keys into the options page.

Pages to try: a pregnancy test page, an ED or therapy site, a "best credit cards for bad credit" list, a "best mattress" roundup. The Guardian should stay quiet.

**Safari:** coming later. Safari extensions can't watch network requests the way Chrome's can.

## Test the pipeline without the extension

```sh
npm run probe -- https://example.com/page          # headless capture → lines → Jev → banner
npm run probe -- --headed --block https://...      # a real browser window, with a simulated ad blocker
npm run replay                                     # re-run analysis on saved captures in runs/
npm run money                                      # money banners on tell's eval pages
```

Put `ANTHROPIC_API_KEY` and `TYPESAFE_API_KEY` in `.env` first.
