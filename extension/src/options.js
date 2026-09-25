const $ = (id) => document.getElementById(id);
chrome.storage.local.get(["anthropicKey", "typesafeKey"]).then((s) => {
  $("anthropic").value = s.anthropicKey || "";
  $("typesafe").value = s.typesafeKey || "";
});
$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ anthropicKey: $("anthropic").value.trim(), typesafeKey: $("typesafe").value.trim() });
  $("saved").textContent = "Saved. Reload a page to try it.";
});
