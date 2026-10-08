import { readFileSync, writeFileSync, existsSync } from "fs";
import { createSign } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(dir, "service-account.json"), "utf8"));

function b64url(input) {
    return Buffer.from(input).toString("base64url");
}

function signJwt(payload) {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    const sign = createSign("RSA-SHA256");
    sign.update(header + "." + body);
    sign.end();
    const sig = sign.sign(sa.private_key).toString("base64url");
    return header + "." + body + "." + sig;
}

const now = Math.floor(Date.now() / 1000);
const assertion = signJwt({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform"
});
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(assertion)
});
const tokenJson = await tokenRes.json();
if (!tokenRes.ok || !tokenJson.access_token) {
    console.error("TOKEN_FAIL", tokenRes.status, tokenJson.error || "unknown");
    process.exit(1);
}
const auth = { Authorization: "Bearer " + tokenJson.access_token, "Content-Type": "application/json" };
const listRes = await fetch("https://firebase.googleapis.com/v1beta1/projects/mavor-37c30/webApps", { headers: auth });
const listJson = await listRes.json();
if (!listRes.ok) {
    console.error("LIST_FAIL", listRes.status, listJson.error && listJson.error.status || "unknown");
    process.exit(1);
}
let app = (listJson.apps || [])[0];
if (!app) {
    const createRes = await fetch("https://firebase.googleapis.com/v1beta1/projects/mavor-37c30/webApps", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ displayName: "aetlis" })
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
        console.error("CREATE_FAIL", createRes.status, createJson.error && createJson.error.status || "unknown");
        process.exit(1);
    }
    const opName = createJson.name;
    for (let i = 0; i < 10; i++) {
        const opRes = await fetch("https://firebase.googleapis.com/v1beta1/" + opName, { headers: auth });
        const opJson = await opRes.json();
        if (opJson.done) {
            app = opJson.response;
            break;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
}
if (!app || !app.appId) {
    console.error("NO_APP");
    process.exit(1);
}
const cfgRes = await fetch("https://firebase.googleapis.com/v1beta1/projects/mavor-37c30/webApps/" + encodeURIComponent(app.appId) + "/config", { headers: auth });
const cfg = await cfgRes.json();
if (!cfgRes.ok || !cfg.apiKey) {
    console.error("CONFIG_FAIL", cfgRes.status);
    process.exit(1);
}
const configPath = join(dir, "config.json");
let existing = {};
if (existsSync(configPath)) {
    try {
        existing = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (e) {
        existing = {};
    }
}
existing.firebaseWebApiKey = cfg.apiKey;
writeFileSync(configPath, JSON.stringify(existing, null, 2));
console.log("API_KEY " + cfg.apiKey);
