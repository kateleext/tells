#!/bin/sh
# tells installer: downloads the extension, takes your keys, walks you through turning it on.
set -e
DEST="$HOME/tells-extension"
URL="https://github.com/kateleext/tells/releases/latest/download/tells-extension.zip"
TTY=/dev/tty
bold() { printf '\033[1m%s\033[0m\n' "$1"; }
wait_enter() { printf '   %s ' "${1:-Press Enter when done}"; read -r _ < $TTY; }
secret() {
  stty -echo < $TTY 2>/dev/null || true
  read -r VAL < $TTY
  stty echo < $TTY 2>/dev/null || true
  echo
}

echo
bold "tells: a brutally honest tracker of everything hidden from you"
echo

echo "Downloading…"
curl -fsSL "$URL" -o /tmp/tells-extension.zip
rm -rf "$DEST" && mkdir -p "$DEST"
unzip -q /tmp/tells-extension.zip -d "$DEST"
echo "   Installed to $DEST"
echo

bold "1/2  Anthropic API key (writes the lines)"
echo "   Get one at https://console.anthropic.com/settings/keys"
printf '   Paste it (hidden), or press Enter to skip: '
secret; ANTHROPIC="$VAL"
[ -z "$ANTHROPIC" ] && echo "   Skipped. tells stays silent until you add it: right-click the tells icon → Options."
echo
bold "2/2  TypeSafe API key (Jev decides when to speak up)"
echo "   Get one at https://typesafe.ai"
printf '   Paste it (hidden), or press Enter to skip: '
secret; TYPESAFE="$VAL"
[ -z "$TYPESAFE" ] && echo "   Skipped. tells stays silent until you add it: right-click the tells icon → Options."
printf '{"anthropicKey":"%s","typesafeKey":"%s"}\n' "$ANTHROPIC" "$TYPESAFE" > "$DEST/config.json"
echo "   Saved on this Mac only. Keys go straight to api.anthropic.com and api.typesafe.ai."
echo

bold "Turn it on in Chrome (about a minute)"
echo
echo "   1. Open the extensions page"
wait_enter "Press Enter to open chrome://extensions"
open -a "Google Chrome" "chrome://extensions" 2>/dev/null || echo "   Open chrome://extensions in your browser (Arc, Edge and Dia work too)."
echo
echo "   2. Switch on Developer mode, the toggle in the top-right corner"
wait_enter
echo
printf %s "$DEST" | pbcopy 2>/dev/null || true
echo "   3. Click \"Load unpacked\". In the file picker press Cmd+Shift+G,"
echo "      paste with Cmd+V (the folder path is on your clipboard), press Enter, then Select"
wait_enter
echo
bold "Done. Try it on these pages:"
echo "   Clearblue: pregnancy tests       https://www.clearblue.com/pregnancy-tests"
echo "   Hims: ED treatment               https://www.hims.com/erectile-dysfunction"
echo "   GoodRx: sildenafil prices        https://www.goodrx.com/sildenafil"
echo "   NerdWallet: bad-credit cards     https://www.nerdwallet.com/best/credit-cards/bad-credit"
echo "   Sleep Foundation: best mattress  https://www.sleepfoundation.org/best-mattress"
echo "   The Guardian (should stay quiet) https://www.theguardian.com/us"
echo
echo "   A neon banner appears at the top when there's something to say."
echo "   Got an ad blocker? Keep it on. tells shows what it stopped and what still got through."
echo
wait_enter "Press Enter to open the first one"
open -a "Google Chrome" "https://www.clearblue.com/pregnancy-tests" 2>/dev/null || true
echo
echo "   To update later, run this installer again and click ↻ on tells in chrome://extensions."
echo
