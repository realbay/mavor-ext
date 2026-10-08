import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "worker", "public");
rmSync(pub, { recursive: true, force: true });
for (const rel of ["js/main.js", "css/style.css", "tampermonkey/aetlis.user.js"]) {
    const dest = join(pub, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(root, rel), dest);
}
const script = readFileSync(join(root, "tampermonkey", "aetlis.user.js"), "utf8");
const loader = script.replace(/^[\s\S]*?==\/UserScript==\s*/, "");
const bookmark = "javascript:" + encodeURIComponent(loader);
writeFileSync(join(pub, "_headers"), `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=60

/tampermonkey/aetlis.user.js
  Content-Type: text/javascript; charset=utf-8
`);
writeFileSync(join(pub, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Install Aetlis</title>
  <style>
    body { font: 16px/1.45 sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    button { background: #d3371e; color: #fff; border: 0; padding: 0.7rem 1rem; border-radius: 6px; font-size: 16px; cursor: pointer; }
    textarea { width: 100%; height: 7rem; font: 12px/1.4 monospace; }
  </style>
</head>
<body>
  <h1>Aetlis bookmark</h1>
  <p>No Tampermonkey. The normal aetlis.io menu stays on screen until you click the bookmark.</p>
  <ol>
    <li>Press <b>Ctrl+Shift+B</b> so the bookmarks bar is visible.</li>
    <li>Right-click the bar and choose <b>Add page</b>.</li>
    <li>Name it <b>Aetlis</b>. Click the button below, paste that into the URL box, and save.</li>
    <li>Open <a href="https://aetlis.io/">aetlis.io</a>, then click the <b>Aetlis</b> bookmark. Wait a second for the Mavor button.</li>
  </ol>
  <p><button type="button" id="copy">Copy bookmark URL</button></p>
  <textarea id="src" readonly></textarea>
  <script>
    var url = ${JSON.stringify(bookmark).replace(/</g, "\\u003c")};
    document.getElementById("src").value = url;
    document.getElementById("copy").onclick = function () {
      navigator.clipboard.writeText(url);
      this.textContent = "Copied";
    };
  </script>
</body>
</html>
`);
console.log("staged client files");
