import { mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const pub = join(dirname(fileURLToPath(import.meta.url)), "public");
rmSync(pub, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
writeFileSync(join(pub, "_headers"), `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=60
`);
writeFileSync(join(pub, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aetlis</title>
</head>
<body>
  <p>The bookmark installer is gone. The extension loads the client from this API.</p>
</body>
</html>
`);
console.log("staged client files");
