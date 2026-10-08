import { cpSync, mkdirSync, rmSync, writeFileSync } from "fs";
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
writeFileSync(join(pub, "_headers"), `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=60

/tampermonkey/aetlis.user.js
  Content-Type: text/plain; charset=utf-8
  Cache-Control: no-cache
`);
writeFileSync(join(pub, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Install Aetlis</title>
</head>
<body>
  <p>Install Tampermonkey first, then open this link. It has to end in <code>.user.js</code>.</p>
  <p><a href="/tampermonkey/aetlis.user.js">Install the Aetlis client</a></p>
  <p>If that only shows the code, open Tampermonkey, go to Utilities, choose Import from URL, and paste:<br>
  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js</p>
</body>
</html>
`);
console.log("staged client files");
