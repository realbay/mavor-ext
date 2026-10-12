/* Fetch images the page cannot read (UK Imgur block / CORS). Prefer DuckDuckGo proxy URLs.
   Also proxies Firebase perk JSON so page CSP cannot block sync. */
try {
    importScripts("auth-config.js");
} catch (e) {}

var AETLIS_AUTH = self.AETLIS_AUTH || { enforce: false, discordClientId: "", functionUrl: "" };
var memorySession = null;
var refreshInFlight = null;

function aetlisPickSession(stored) {
    var disk = stored && stored.idToken ? stored : null;
    var mem = memorySession && memorySession.idToken ? memorySession : null;
    var session = disk || mem || stored || null;
    if (disk && mem)
        session = (mem.expiresAt || 0) >= (disk.expiresAt || 0) ? mem : disk;
    if (session && session.idToken)
        memorySession = session;
    return session;
}

function aetlisAuthRead() {
    try {
        var pending = chrome.storage.local.get("aetlisAuth");
        if (pending && typeof pending.then === "function")
            return pending.then(function (row) {
                return aetlisPickSession(row && row.aetlisAuth || null);
            });
    } catch (e) {}
    return new Promise(function (resolve) {
        chrome.storage.local.get("aetlisAuth", function (row) {
            resolve(aetlisPickSession(row && row.aetlisAuth || null));
        });
    });
}

function aetlisAuthGet() {
    return aetlisAuthRead().then(function (session) {
        if (session && session.idToken)
            return session;
        return new Promise(function (resolve) {
            setTimeout(function () {
                aetlisAuthRead().then(resolve);
            }, 150);
        });
    });
}

function aetlisAuthSet(session) {
    if (session && session.idToken)
        memorySession = session;
    try {
        var pending = chrome.storage.local.set({ aetlisAuth: session });
        if (pending && typeof pending.then === "function")
            return pending.then(function () {
                return session;
            });
    } catch (e) {}
    return new Promise(function (resolve) {
        chrome.storage.local.set({ aetlisAuth: session }, function () {
            resolve(session);
        });
    });
}

function aetlisAdopt(session, extra) {
    if (session && session.idToken)
        return Promise.resolve(session);
    if (!extra || !extra.idToken)
        return Promise.resolve(session);
    return aetlisAuthSet({
        idToken: extra.idToken,
        refreshToken: extra.refreshToken || "",
        expiresAt: extra.expiresAt || 0,
        apiKey: extra.apiKey || aetlisApiKey(session),
        discordId: String(extra.discordId || (session && session.discordId) || ""),
        name: extra.name || (session && session.name) || "",
        username: extra.username || (session && session.username) || "",
        avatar: extra.avatar || (session && session.avatar) || "",
        status: extra.status || (session && session.status) || "pending"
    });
}

function aetlisAuthReply(session) {
    var pub = aetlisPublicSession(session);
    return {
        ok: true,
        enforce: !!AETLIS_AUTH.enforce,
        session: pub,
        credentials: session && session.idToken ? {
            idToken: session.idToken,
            refreshToken: session.refreshToken || "",
            expiresAt: session.expiresAt || 0,
            apiKey: session.apiKey || "",
            discordId: String(session.discordId || ""),
            name: session.name || "",
            username: session.username || "",
            avatar: session.avatar || "",
            status: session.status || "pending"
        } : null
    };
}

function aetlisPublicSession(session) {
    if (!session)
        return null;
    return {
        status: session.status || "pending",
        discordId: session.discordId || "",
        name: session.name || "",
        username: session.username || "",
        avatar: session.avatar || ""
    };
}

function aetlisApiKey(session) {
    return (session && session.apiKey) || (AETLIS_AUTH && AETLIS_AUTH.firebaseWebApiKey) || "";
}

function aetlisAuthFresh(session, force) {
    if (!session)
        return Promise.resolve(session);
    var apiKey = aetlisApiKey(session);
    if (apiKey && !session.apiKey)
        session.apiKey = apiKey;
    var stale = !!force || !session.idToken || !session.expiresAt || session.expiresAt - Date.now() < 5 * 60000;
    if (!stale)
        return Promise.resolve(session);
    if (!session.refreshToken || !AETLIS_AUTH.functionUrl)
        return Promise.resolve(session);
    if (refreshInFlight)
        return refreshInFlight;
    var tokenUsed = session.refreshToken;
    refreshInFlight = fetch(AETLIS_AUTH.functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", refreshToken: tokenUsed })
    }).then(function (res) {
        return res.json().then(function (json) {
            return aetlisAuthGet().then(function (latest) {
                var base = latest && latest.idToken ? latest : session;
                var newer = base.refreshToken && base.refreshToken !== tokenUsed && (base.expiresAt || 0) > (session.expiresAt || 0);
                if (newer)
                    return base;
                if (!res.ok || !json || !json.ok || !json.idToken)
                    return base;
                base.idToken = json.idToken;
                base.refreshToken = json.refreshToken || base.refreshToken;
                base.expiresAt = Date.now() + (Number(json.expiresIn) || 3600) * 1000;
                if (apiKey)
                    base.apiKey = apiKey;
                return aetlisAuthSet(base);
            });
        });
    }).catch(function () {
        return aetlisAuthGet().then(function (latest) {
            return latest && latest.idToken ? latest : session;
        });
    }).then(function (saved) {
        refreshInFlight = null;
        return saved;
    }, function () {
        refreshInFlight = null;
        return session;
    });
    return refreshInFlight;
}

function aetlisAdminPost(session, msg) {
    return fetch(AETLIS_AUTH.functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: msg.action || "list",
            idToken: session.idToken,
            discordId: msg.discordId || ""
        })
    }).then(function (res) {
        return res.json().then(function (json) {
            return json || { ok: false };
        });
    });
}

function aetlisCheckApproved(session) {
    if (!session || !session.idToken || !AETLIS_AUTH.functionUrl)
        return Promise.resolve(session);
    return fetch(AETLIS_AUTH.functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "status",
            idToken: session.idToken,
            name: session.name || "",
            username: session.username || "",
            avatar: session.avatar || ""
        })
    }).then(function (res) {
        return res.json().then(function (json) {
            if (!res.ok || !json || !json.ok)
                return session;
            return aetlisAuthGet().then(function (latest) {
                var next = latest && latest.idToken ? latest : session;
                next.status = json.status === "approved" ? "approved" : "pending";
                if (json.name)
                    next.name = json.name;
                if (json.username)
                    next.username = json.username;
                if (json.avatar)
                    next.avatar = json.avatar;
                return aetlisAuthSet(next);
            });
        });
    }).catch(function () {
        return session;
    });
}

function aetlisDiscordLogin() {
    var cfg = AETLIS_AUTH;
    if (!cfg.discordClientId || !cfg.functionUrl)
        return Promise.resolve({ ok: false, error: "Discord login is not configured yet" });
    var redirectUri = chrome.identity.getRedirectURL();
    var authUrl = "https://discord.com/api/oauth2/authorize?client_id=" + encodeURIComponent(cfg.discordClientId)
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&response_type=code&scope=identify&prompt=consent";
    return new Promise(function (resolve) {
        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, function (redirected) {
            var err = chrome.runtime.lastError;
            if (err || !redirected) {
                resolve({ ok: false, error: err && err.message || "Login cancelled" });
                return;
            }
            var code = "";
            try {
                code = new URL(redirected).searchParams.get("code") || "";
            } catch (e) {}
            if (!code) {
                resolve({ ok: false, error: "Discord did not return a code" });
                return;
            }
            fetch(cfg.functionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code, redirectUri: redirectUri })
            }).then(function (res) {
                return res.json().then(function (json) {
                    return { res: res, json: json };
                });
            }).then(function (out) {
                var json = out.json || {};
                if (!out.res.ok || !json.ok || !json.idToken || !json.discord) {
                    resolve({ ok: false, error: json.error || "Login failed" });
                    return;
                }
                var session = {
                    idToken: json.idToken,
                    refreshToken: json.refreshToken || "",
                    expiresAt: Date.now() + (Number(json.expiresIn) || 3600) * 1000,
                    discordId: String(json.discord.id),
                    name: json.discord.name || "",
                    username: json.discord.username || "",
                    avatar: json.discord.avatar || "",
                    status: json.status === "approved" ? "approved" : "pending",
                    apiKey: json.apiKey || ""
                };
                aetlisAuthSet(session).then(function (saved) {
                    resolve(aetlisAuthReply(saved));
                });
            }).catch(function (e) {
                resolve({ ok: false, error: String(e && e.message || e) });
            });
        });
    });
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) {
        return;
    }

    if (msg.type === "aetlis-proxy-image") {
        var url = String(msg.url || "").trim();
        if (!/^https?:\/\//i.test(url)) {
            sendResponse({ ok: !1, error: "bad-url" });
            return;
        }
        fetch(url, {
            method: "GET",
            redirect: "follow",
            credentials: "omit",
            cache: "no-cache"
        }).then(function (res) {
            if (!res.ok)
                throw new Error("http-" + res.status);
            var type = (res.headers.get("content-type") || "").toLowerCase();
            if (type && type.indexOf("image") < 0 && type.indexOf("octet-stream") < 0)
                throw new Error("not-image:" + type);
            return res.blob();
        }).then(function (blob) {
            if (!blob || !blob.size)
                throw new Error("empty");
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result) };
                reader.onerror = function () { reject(new Error("read-failed")) };
                reader.readAsDataURL(blob);
            });
        }).then(function (dataUrl) {
            sendResponse({ ok: !0, dataUrl: dataUrl });
        }).catch(function (err) {
            sendResponse({ ok: !1, error: String(err && err.message || err || "fetch-failed") });
        });
        return !0;
    }

    if (msg.type === "aetlis-auth-status" || msg.type === "aetlis-auth-poll") {
        var cfgStatus = AETLIS_AUTH;
        if (!cfgStatus.enforce) {
            sendResponse({ ok: true, enforce: false, session: null });
            return;
        }
        aetlisAuthGet().then(function (session) {
            return aetlisAuthFresh(session);
        }).then(function (session) {
            return aetlisCheckApproved(session);
        }).then(function (session) {
            sendResponse(aetlisAuthReply(session));
        }).catch(function () {
            sendResponse({ ok: false, enforce: !!AETLIS_AUTH.enforce, session: null });
        });
        return !0;
    }

    if (msg.type === "aetlis-auth-admin") {
        aetlisAuthGet().then(function (session) {
            return aetlisAdopt(session, msg.credentials);
        }).then(function (session) {
            return aetlisAuthFresh(session);
        }).then(function (session) {
            if (!session || !session.idToken || !AETLIS_AUTH.functionUrl)
                return { ok: false, error: "not-signed-in" };
            return aetlisAdminPost(session, msg).then(function (json) {
                var err = json && json.error;
                if (json && json.ok)
                    return json;
                if (err !== "Not signed in" && err !== "Not allowed")
                    return json || { ok: false };
                return aetlisAuthFresh(session, true).then(function (next) {
                    if (!next || !next.idToken)
                        return { ok: false, error: "not-signed-in" };
                    if (next.idToken === session.idToken)
                        return json || { ok: false };
                    return aetlisAdminPost(next, msg);
                });
            });
        }).then(function (json) {
            sendResponse(json || { ok: false });
        }).catch(function () {
            sendResponse({ ok: false });
        });
        return !0;
    }

    if (msg.type === "aetlis-auth-login") {
        aetlisDiscordLogin().then(sendResponse);
        return !0;
    }

    if (msg.type === "aetlis-auth-logout") {
        aetlisAuthGet().then(function (session) {
            var finish = function () {
                chrome.storage.local.remove("aetlisAuth", function () {
                    sendResponse({ ok: true, enforce: !!AETLIS_AUTH.enforce, session: null, loggedOut: true });
                });
            };
            memorySession = null;
            if (!session || !session.discordId || !session.idToken)
                return finish();
            fetch("https://mavor-37c30-default-rtdb.europe-west1.firebasedatabase.app/presence/"
                + encodeURIComponent(session.discordId) + ".json?auth=" + encodeURIComponent(session.idToken), {
                method: "DELETE",
                credentials: "omit"
            }).then(finish, finish);
        });
        return !0;
    }

    if (msg.type === "aetlis-perk-fetch") {
        var perkUrl = String(msg.url || "").trim();
        var method = String(msg.method || "GET").toUpperCase();
        if (!/^https:\/\/[^/]+\.firebasedatabase\.app\//i.test(perkUrl)) {
            sendResponse({ ok: !1, error: "bad-url" });
            return;
        }
        var opts = {
            method: method,
            credentials: "omit",
            cache: "no-store",
            redirect: "follow",
            headers: {
                Accept: "application/json"
            }
        };
        if (method !== "GET" && method !== "HEAD") {
            opts.headers["Content-Type"] = "application/json";
            opts.body = null == msg.body ? "null" : (typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body));
        }
        aetlisAuthGet().then(function (session) {
            return aetlisAdopt(session, msg.credentials);
        }).then(aetlisAuthFresh).then(function (session) {
            var approved = !!(session && session.status === "approved" && session.discordId);
            var gateApproved = msg.gateApproved === true;
            if (AETLIS_AUTH.enforce && !approved && !gateApproved) {
                sendResponse({ ok: false, error: "not-approved" });
                return;
            }
            function authedUrl(token) {
                if (!token)
                    return perkUrl;
                return perkUrl + (perkUrl.indexOf("?") >= 0 ? "&" : "?") + "auth=" + encodeURIComponent(token);
            }
            return fetch(authedUrl(session && session.idToken), opts).then(function (res) {
                if (!session || !session.refreshToken || (res.status !== 401 && res.status !== 403))
                    return res;
                return aetlisAuthFresh(session, true).then(function (next) {
                    if (!next || !next.idToken || next.idToken === session.idToken)
                        return res;
                    return fetch(authedUrl(next.idToken), opts);
                });
            });
        }).then(function (res) {
            if (!res)
                return;
            return res.text().then(function (text) {
                var data = null;
                if (text && text.length) {
                    try {
                        data = JSON.parse(text)
                    } catch (e) {
                        data = text
                    }
                }
                sendResponse({
                    ok: res.ok,
                    status: res.status,
                    data: data
                });
            });
        }).catch(function (err) {
            sendResponse({ ok: !1, error: String(err && err.message || err || "fetch-failed") });
        });
        return !0;
    }
});
