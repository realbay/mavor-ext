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
`);
console.log("staged client files");
