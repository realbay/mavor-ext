/* Needs the Firebase Blaze plan. Use the worker/ folder instead. It runs on Cloudflare's free plan. */
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

function envList(name) {
    return String(process.env[name] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

exports.discordAuth = onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "POST only" });
        return;
    }
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
    const apiKey = process.env.FIREBASE_WEB_API_KEY || "";
    if (!clientId || !clientSecret || !apiKey) {
        res.status(500).json({ ok: false, error: "Server auth is not configured" });
        return;
    }
    const code = req.body && req.body.code;
    const redirectUri = req.body && req.body.redirectUri;
    if (!code || !redirectUri) {
        res.status(400).json({ ok: false, error: "Missing code" });
        return;
    }
    try {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code: String(code),
            redirect_uri: String(redirectUri)
        });
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
        });
        const tokenJson = await tokenRes.json();
        if (!tokenRes.ok || !tokenJson.access_token) {
            res.status(401).json({ ok: false, error: "Discord token exchange failed" });
            return;
        }
        const userRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: "Bearer " + tokenJson.access_token }
        });
        const user = await userRes.json();
        if (!userRes.ok || !user.id) {
            res.status(401).json({ ok: false, error: "Discord profile failed" });
            return;
        }
        const db = admin.database();
        const owners = envList("OWNER_DISCORD_IDS");
        const approvedRef = db.ref("approved/" + user.id);
        const approvedSnap = await approvedRef.get();
        let status = approvedSnap.exists() ? "approved" : "pending";
        const avatar = user.avatar
            ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + (String(user.avatar).indexOf("a_") === 0 ? ".gif" : ".png")
            : "https://cdn.discordapp.com/embed/avatars/" + (Number(String(user.id).slice(-1)) % 6) + ".png";
        const profile = {
            name: user.global_name || user.username || "Player",
            username: user.username || "",
            avatar: avatar,
            t: Date.now()
        };
        if (owners.indexOf(String(user.id)) >= 0) {
            await approvedRef.set(profile);
            status = "approved";
        } else if (status !== "approved") {
            await db.ref("requests/" + user.id).set(Object.assign({ status: "pending" }, profile));
        }
        const customToken = await admin.auth().createCustomToken(String(user.id));
        const exch = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + encodeURIComponent(apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
        });
        const exchJson = await exch.json();
        if (!exch.ok || !exchJson.idToken) {
            res.status(500).json({ ok: false, error: "Could not sign in" });
            return;
        }
        res.json({
            ok: true,
            status: status,
            idToken: exchJson.idToken,
            refreshToken: exchJson.refreshToken,
            expiresIn: Number(exchJson.expiresIn) || 3600,
            discord: {
                id: String(user.id),
                name: profile.name,
                avatar: avatar
            },
            apiKey: apiKey
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err && err.message || err) });
    }
});
