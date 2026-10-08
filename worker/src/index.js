const DB = "https://mavor-37c30-default-rtdb.europe-west1.firebasedatabase.app";

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

function b64url(bytes) {
    const bin = String.fromCharCode.apply(null, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToDer(pem) {
    const b64 = String(pem || "").replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++)
        out[i] = raw.charCodeAt(i);
    return out;
}

async function signJwt(privateKeyPem, payload) {
    const key = await crypto.subtle.importKey(
        "pkcs8",
        pemToDer(privateKeyPem),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const enc = new TextEncoder();
    const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const body = b64url(enc.encode(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + body));
    return head + "." + body + "." + b64url(sig);
}

async function googleAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);
    const assertion = await signJwt(env.FIREBASE_PRIVATE_KEY, {
        iss: env.FIREBASE_CLIENT_EMAIL,
        sub: env.FIREBASE_CLIENT_EMAIL,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email"
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(assertion)
    });
    const data = await res.json();
    if (!res.ok || !data.access_token)
        throw new Error("Firebase admin login failed");
    return data.access_token;
}

async function dbGet(token, path) {
    const res = await fetch(DB + path + ".json?access_token=" + encodeURIComponent(token));
    if (!res.ok)
        throw new Error("Database read failed");
    return res.json();
}

async function dbPut(token, path, value) {
    const res = await fetch(DB + path + ".json?access_token=" + encodeURIComponent(token), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value)
    });
    if (!res.ok)
        throw new Error("Database write failed");
}

async function dbDel(token, path) {
    const res = await fetch(DB + path + ".json?access_token=" + encodeURIComponent(token), { method: "DELETE" });
    if (!res.ok)
        throw new Error("Database delete failed");
}

async function tokenUid(env, idToken) {
    const res = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: idToken })
    });
    const data = await res.json();
    const uid = data && data.users && data.users[0] && data.users[0].localId;
    return res.ok && uid ? String(uid) : "";
}

async function ownerUid(env, idToken) {
    const uid = await tokenUid(env, idToken);
    if (!uid)
        return "";
    const owners = String(env.OWNER_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    return owners.indexOf(uid) >= 0 ? uid : "";
}

async function handleRefresh(env, body) {
    const refreshToken = String(body && body.refreshToken || "");
    if (!refreshToken)
        return json(400, { ok: false, error: "Missing refresh" });
    const res = await fetch("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken)
    });
    const data = await res.json();
    if (!res.ok || !data.id_token)
        return json(401, { ok: false, error: "Refresh failed" });
    return json(200, {
        ok: true,
        idToken: data.id_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: Number(data.expires_in) || 3600
    });
}

async function handleAdmin(env, body) {
    if (body && body.action === "status") {
        const who = await tokenUid(env, body.idToken);
        if (!who)
            return json(401, { ok: false, error: "Not signed in" });
        const reader = await googleAccessToken(env);
        const approved = await dbGet(reader, "/approved/" + who);
        const profile = approved && typeof approved === "object" ? approved : null;
        if (!profile) {
            const existing = await dbGet(reader, "/requests/" + who);
            if (!existing || typeof existing !== "object") {
                await dbPut(reader, "/requests/" + who, {
                    status: "pending",
                    name: body.name || "Player",
                    username: body.username || "",
                    avatar: body.avatar || "",
                    t: Date.now()
                });
            }
        }
        return json(200, {
            ok: true,
            status: profile ? "approved" : "pending",
            name: profile && profile.name || body.name || "",
            username: profile && profile.username || body.username || "",
            avatar: profile && profile.avatar || body.avatar || ""
        });
    }
    const uid = await ownerUid(env, body && body.idToken);
    if (!uid)
        return json(403, { ok: false, error: "Not allowed" });
    const admin = await googleAccessToken(env);
    const action = String(body.action || "");
    if (action === "list") {
        const raw = await dbGet(admin, "/requests");
        const rows = [];
        if (raw && typeof raw === "object") {
            for (const id in raw) {
                const row = raw[id] || {};
                rows.push({
                    id: id,
                    name: row.name || "Player",
                    username: row.username || "",
                    avatar: row.avatar || ""
                });
            }
        }
        rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const approvedRaw = await dbGet(admin, "/approved");
        const approved = [];
        if (approvedRaw && typeof approvedRaw === "object") {
            for (const id in approvedRaw) {
                if (id.charAt(0) === "_")
                    continue;
                const row = approvedRaw[id] || {};
                approved.push({
                    id: id,
                    name: row.name || "Player",
                    username: row.username || "",
                    avatar: row.avatar || ""
                });
            }
        }
        approved.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return json(200, { ok: true, rows: rows, approved: approved });
    }
    const discordId = String(body.discordId || "").replace(/[^\d]/g, "");
    if (!discordId)
        return json(400, { ok: false, error: "Missing account" });
    if (action === "approve") {
        const profile = await dbGet(admin, "/requests/" + discordId);
        const saved = profile && typeof profile === "object" ? profile : { name: "Player", t: Date.now() };
        saved.status = "approved";
        saved.t = Date.now();
        await dbPut(admin, "/approved/" + discordId, saved);
        await dbDel(admin, "/requests/" + discordId);
        return json(200, { ok: true });
    }
    if (action === "revoke") {
        const profile = await dbGet(admin, "/approved/" + discordId);
        if (profile && typeof profile === "object") {
            profile.status = "pending";
            profile.t = Date.now();
            await dbPut(admin, "/requests/" + discordId, profile);
        }
        await dbDel(admin, "/approved/" + discordId);
        await dbDel(admin, "/presence/" + discordId);
        return json(200, { ok: true });
    }
    if (action === "deny") {
        await dbDel(admin, "/requests/" + discordId);
        await dbDel(admin, "/approved/" + discordId);
        return json(200, { ok: true });
    }
    return json(400, { ok: false, error: "Unknown action" });
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS")
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Allow-Methods": "POST, OPTIONS"
                }
            });
        if (request.method !== "POST")
            return json(405, { ok: false, error: "POST only" });
        if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.FIREBASE_WEB_API_KEY || !env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL)
            return json(500, { ok: false, error: "Server auth is not configured" });
        let body = {};
        try {
            body = await request.json();
        } catch (e) {
            body = {};
        }
        if (body && body.action === "refresh") {
            try {
                return await handleRefresh(env, body);
            } catch (err) {
                return json(500, { ok: false, error: String(err && err.message || err) });
            }
        }
        if (body && (body.action === "list" || body.action === "approve" || body.action === "deny" || body.action === "revoke" || body.action === "status")) {
            try {
                return await handleAdmin(env, body);
            } catch (err) {
                return json(500, { ok: false, error: String(err && err.message || err) });
            }
        }
        const code = body && body.code;
        const redirectUri = body && body.redirectUri;
        if (!code || !redirectUri)
            return json(400, { ok: false, error: "Missing code" });
        try {
            const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: env.DISCORD_CLIENT_ID,
                    client_secret: env.DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code: String(code),
                    redirect_uri: String(redirectUri)
                })
            });
            const tokenJson = await tokenRes.json();
            if (!tokenRes.ok || !tokenJson.access_token)
                return json(401, { ok: false, error: "Discord token exchange failed" });
            const userRes = await fetch("https://discord.com/api/users/@me", {
                headers: { Authorization: "Bearer " + tokenJson.access_token }
            });
            const user = await userRes.json();
            if (!userRes.ok || !user.id)
                return json(401, { ok: false, error: "Discord profile failed" });
            const admin = await googleAccessToken(env);
            const approved = await dbGet(admin, "/approved/" + user.id);
            const status = approved && typeof approved === "object" ? "approved" : "pending";
            const avatar = user.avatar
                ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + (String(user.avatar).indexOf("a_") === 0 ? ".gif" : ".png")
                : "https://cdn.discordapp.com/embed/avatars/" + (Number(String(user.id).slice(-1)) % 6) + ".png";
            const profile = {
                name: user.global_name || user.username || "Player",
                username: user.username || "",
                avatar: avatar,
                t: Date.now()
            };
            if (status !== "approved")
                await dbPut(admin, "/requests/" + user.id, Object.assign({ status: "pending" }, profile));
            const now = Math.floor(Date.now() / 1000);
            const customToken = await signJwt(env.FIREBASE_PRIVATE_KEY, {
                iss: env.FIREBASE_CLIENT_EMAIL,
                sub: env.FIREBASE_CLIENT_EMAIL,
                aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
                iat: now,
                exp: now + 3600,
                uid: String(user.id)
            });
            const exch = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: customToken, returnSecureToken: true })
            });
            const exchJson = await exch.json();
            if (!exch.ok || !exchJson.idToken)
                return json(500, { ok: false, error: "Could not sign in" });
            return json(200, {
                ok: true,
                status: status,
                idToken: exchJson.idToken,
                refreshToken: exchJson.refreshToken,
                expiresIn: Number(exchJson.expiresIn) || 3600,
                discord: {
                    id: String(user.id),
                    name: profile.name,
                    username: profile.username || "",
                    avatar: avatar
                },
                apiKey: env.FIREBASE_WEB_API_KEY
            });
        } catch (err) {
            return json(500, { ok: false, error: String(err && err.message || err) });
        }
    }
};
