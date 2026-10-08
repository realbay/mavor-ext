import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const configPath = join(dir, "config.json");
const accountPath = join(dir, "service-account.json");
if (!existsSync(configPath)) {
    console.error("Missing worker/config.json. Copy config.example.json and fill it in.");
    process.exit(1);
}
if (!existsSync(accountPath)) {
    console.error("Missing worker/service-account.json. Download it from Firebase, Project settings, Service accounts.");
    process.exit(1);
}
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const sa = JSON.parse(readFileSync(accountPath, "utf8"));
const required = ["discordClientId", "discordClientSecret", "firebaseWebApiKey", "ownerDiscordIds"];
for (const key of required) {
    if (!String(cfg[key] || "").trim()) {
        console.error("worker/config.json is missing " + key);
        process.exit(1);
    }
}
if (!sa.client_email || !sa.private_key) {
    console.error("worker/service-account.json does not look like a Firebase service account key.");
    process.exit(1);
}
const secrets = {
    DISCORD_CLIENT_ID: String(cfg.discordClientId).trim(),
    DISCORD_CLIENT_SECRET: String(cfg.discordClientSecret).trim(),
    FIREBASE_WEB_API_KEY: String(cfg.firebaseWebApiKey).trim(),
    OWNER_DISCORD_IDS: String(cfg.ownerDiscordIds).trim(),
    FIREBASE_CLIENT_EMAIL: sa.client_email,
    FIREBASE_PRIVATE_KEY: sa.private_key
};
const result = spawnSync("npx wrangler secret bulk", {
    cwd: dir,
    input: JSON.stringify(secrets),
    stdio: ["pipe", "inherit", "inherit"],
    shell: true
});
process.exit(result.status == null ? 1 : result.status);
