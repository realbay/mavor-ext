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
    body { font: 16px/1.45 sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; }
    a.btn { display: inline-block; background: #d3371e; color: #fff; text-decoration: none; padding: 0.6rem 1rem; border-radius: 6px; }
    textarea { width: 100%; height: 16rem; font: 13px/1.4 monospace; }
    button { margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>Install the Aetlis client</h1>
  <ol>
    <li>Install Tampermonkey from the Chrome Web Store.</li>
    <li>Open <code>chrome://extensions</code>, click Tampermonkey, and turn on <b>Allow user scripts</b>. If that switch is missing, turn on Developer mode first.</li>
    <li>Then use the install button. If a tampermonkey.net page stays open and nothing else happens, the switch above is still off.</li>
  </ol>
  <p><a class="btn" href="/tampermonkey/aetlis.user.js">Install</a></p>
  <h2>If that page stays open</h2>
  <p>In Tampermonkey, create a new script, replace everything with the text below, then File → Save.</p>
  <textarea id="src" readonly>${script.replace(/</g, "&lt;")}</textarea>
  <p><button type="button" id="copy">Copy script</button></p>
  <script>
    document.getElementById("copy").onclick = function () {
      var text = document.getElementById("src").value;
      navigator.clipboard.writeText(text);
      this.textContent = "Copied";
    };
  </script>
</body>
</html>
`);
console.log("staged client files");
