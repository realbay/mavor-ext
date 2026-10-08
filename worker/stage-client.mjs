import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "worker", "public");
rmSync(pub, { recursive: true, force: true });
const scriptPath = join(root, "tampermonkey", "aetlis.user.js");
const dest = join(pub, "tampermonkey", "aetlis.user.js");
mkdirSync(dirname(dest), { recursive: true });
cpSync(scriptPath, dest);
const script = readFileSync(scriptPath, "utf8");
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
    textarea { width: 100%; height: 18rem; font: 12px/1.4 monospace; }
  </style>
</head>
<body>
  <h1>Tampermonkey</h1>
  <p>Turn the unpacked extension off. Then paste this script into Tampermonkey.</p>
  <ol>
    <li>Open the Tampermonkey dashboard and create a new script.</li>
    <li>Select all, delete it, paste the script below, then File → Save.</li>
    <li>Open <a href="https://aetlis.io/">aetlis.io</a>. The normal menu shows for a second, then the Mavor button appears.</li>
  </ol>
  <textarea id="src" readonly>${script.replace(/</g, "&lt;")}</textarea>
  <p><button type="button" id="copy">Copy script</button></p>
  <script>
    document.getElementById("copy").onclick = function () {
      navigator.clipboard.writeText(document.getElementById("src").value);
      this.textContent = "Copied";
    };
  </script>
</body>
</html>
`);
console.log("staged client files");
