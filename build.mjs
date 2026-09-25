import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const shared = { bundle: true, loader: { ".css": "text" }, logLevel: "info", legalComments: "none", platform: "browser" };

const builds = [
  { ...shared, entryPoints: ["extension/src/background.js"], outfile: "extension/dist/background.js", format: "esm" },
  { ...shared, entryPoints: ["extension/src/content.js"], outfile: "extension/dist/content.js", format: "iife" },
  { ...shared, entryPoints: ["extension/src/options.js"], outfile: "extension/dist/options.js", format: "iife" },
];

if (watch) for (const b of builds) await (await esbuild.context(b)).watch();
else await Promise.all(builds.map((b) => esbuild.build(b)));
