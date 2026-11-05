import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
let checked = 0;

for (const [, attrs, source] of blocks) {
  if (/\bsrc\s*=/.test(attrs)) continue;
  const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
  new vm.Script(source, { filename: "index.html:inline-" + (++checked) + ".js" });
}

if (!checked) throw new Error("No inline JavaScript blocks were checked.");
JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
JSON.parse(fs.readFileSync("_routes.json", "utf8"));
console.log("Validated " + checked + " inline JavaScript blocks and project JSON files.");
