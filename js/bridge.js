/* Fetch Imgur/DDG images with extension privileges; hand a data URL to the page (no CORS).
   Also proxies Firebase perk GET/PUT for the page script. */
(function () {
    window.addEventListener("message", function (ev) {
        if (ev.source !== window || !ev.data || ev.data.source !== "aetlis-page")
            return;

        if (ev.data.type === "aetlis-proxy-image-req") {
            var id = ev.data.id
                , url = ev.data.url;

            function fail(error) {
                window.postMessage({
                    source: "aetlis-bridge",
                    type: "aetlis-proxy-image-res",
                    id: id,
                    ok: !1,
                    error: String(error || "fetch-failed")
                }, "*");
            }

            function okDataUrl(dataUrl) {
                window.postMessage({
                    source: "aetlis-bridge",
                    type: "aetlis-proxy-image-res",
                    id: id,
                    ok: !0,
                    dataUrl: dataUrl
                }, "*");
            }

            function blobToDataUrl(blob) {
                return new Promise(function (resolve, reject) {
                    var reader = new FileReader();
                    reader.onload = function () { resolve(reader.result) };
                    reader.onerror = function () { reject(new Error("read-failed")) };
                    reader.readAsDataURL(blob);
                });
            }

            fetch(url, {
                method: "GET",
                credentials: "omit",
                cache: "force-cache",
                redirect: "follow"
            }).then(function (res) {
                if (!res.ok)
                    throw new Error("http-" + res.status);
                return res.blob();
            }).then(function (blob) {
                if (!blob || !blob.size)
                    throw new Error("empty");
                return blobToDataUrl(blob);
            }).then(okDataUrl).catch(function (err1) {
                try {
                    chrome.runtime.sendMessage({ type: "aetlis-proxy-image", url: url }, function (res) {
                        var err = chrome.runtime.lastError;
                        if (err || !res || !res.ok)
                            fail(err ? err.message : (res && res.error || err1 && err1.message || err1));
                        else
                            okDataUrl(res.dataUrl);
                    });
                } catch (e) {
                    fail(e && e.message || e || err1);
                }
            });
            return;
        }

        if (ev.data.type === "aetlis-perk-fetch-req") {
            var perkId = ev.data.id;
            var gate = null;
            try {
                gate = JSON.parse(localStorage.getItem("aetlisAuthGate") || "null");
            } catch (e) {}
            try {
                chrome.runtime.sendMessage({
                    type: "aetlis-perk-fetch",
                    url: ev.data.url,
                    method: ev.data.method || "GET",
                    body: ev.data.body,
                    gateApproved: !!(gate && gate.status === "approved" && gate.discordId)
                }, function (res) {
                    var err = chrome.runtime.lastError;
                    window.postMessage({
                        source: "aetlis-bridge",
                        type: "aetlis-perk-fetch-res",
                        id: perkId,
                        ok: !!(!err && res && res.ok),
                        status: res && res.status,
                        data: res && res.data,
                        error: err ? err.message : (res && res.error || null)
                    }, "*");
                });
            } catch (e) {
                window.postMessage({
                    source: "aetlis-bridge",
                    type: "aetlis-perk-fetch-res",
                    id: perkId,
                    ok: !1,
                    error: String(e && e.message || e || "bridge-failed")
                }, "*");
            }
        }
    });
})();

(function aetlisAuthOverlay() {
    if (window.top !== window)
        return;

    var root = null
        , poll = null
        , revokeTimer = null
        , locked = false
        , decided = false
        , lastSession = null
        , lastError = ""
        , watcher = null;

    if (self.AETLIS_AUTH && self.AETLIS_AUTH.enforce && document.documentElement)
        document.documentElement.setAttribute("data-aetlis-auth", "required");

    var gateKey = "aetlisAuthGate";

    function publicSession(session) {
        if (!session || !session.discordId)
            return null;
        return {
            status: session.status === "approved" ? "approved" : "pending",
            discordId: String(session.discordId),
            name: session.name || "",
            username: session.username || "",
            avatar: session.avatar || ""
        };
    }

    function readGate() {
        try {
            var raw = localStorage.getItem(gateKey);
            if (!raw)
                return null;
            return publicSession(JSON.parse(raw));
        } catch (e) {
            return null;
        }
    }

    function writeGate(session) {
        var pub = publicSession(session);
        if (!pub)
            return;
        try {
            localStorage.setItem(gateKey, JSON.stringify(pub));
        } catch (e) {}
    }

    function clearGate() {
        try {
            localStorage.removeItem(gateKey);
        } catch (e) {}
        lastSession = null;
    }

    function persistCredentials(c) {
        if (!c || !c.idToken || !c.discordId)
            return;
        var full = {
            idToken: c.idToken,
            refreshToken: c.refreshToken || "",
            expiresAt: c.expiresAt || 0,
            apiKey: c.apiKey || "",
            discordId: String(c.discordId),
            name: c.name || "",
            username: c.username || "",
            avatar: c.avatar || "",
            status: c.status === "approved" ? "approved" : "pending"
        };
        try {
            chrome.storage.local.set({ aetlisAuth: full });
        } catch (e) {}
        writeGate(full);
    }

    function tellPage(payload) {
        var session = publicSession(payload && payload.session);
        window.postMessage({
            source: "aetlis-bridge",
            type: "aetlis-auth-state",
            enforce: !!(payload && payload.enforce),
            session: session
        }, "*");
    }

    function hide() {
        locked = false;
        poll && clearInterval(poll),
            poll = null;
        if (watcher)
            watcher.disconnect(),
            watcher = null;
        if (document.documentElement) {
            document.documentElement.classList.remove("aetlis-auth-locked");
            document.documentElement.removeAttribute("data-aetlis-auth");
        }
        if (root && root.parentNode)
            root.parentNode.removeChild(root);
        root = null;
    }

    function arm() {
        locked = true;
        if (document.documentElement) {
            document.documentElement.classList.add("aetlis-auth-locked");
            document.documentElement.setAttribute("data-aetlis-auth", "required");
        }
        if (watcher || !document.documentElement)
            return;
        watcher = new MutationObserver(function () {
            if (!locked)
                return;
            if (!document.documentElement.classList.contains("aetlis-auth-locked"))
                document.documentElement.classList.add("aetlis-auth-locked");
            if (decided && (!root || !root.isConnected))
                show(lastSession, lastError);
        });
        watcher.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"]
        });
    }

    function ensure() {
        if (root && root.isConnected)
            return root;
        root = null;
        var style = document.createElement("style");
        style.textContent = "html.aetlis-auth-locked,html.aetlis-auth-locked body{background:#07080d!important;overflow:hidden!important}"
            + "html.aetlis-auth-locked>*:not(#aetlis-auth-gate),html.aetlis-auth-locked body>*:not(#aetlis-auth-gate){display:none!important}"
            + "#aetlis-auth-gate{position:fixed;inset:0;z-index:2147483646;background:#07080d;color:#f2f3f5;display:flex;align-items:center;justify-content:center;font-family:Ubuntu,Segoe UI,sans-serif}"
            + "#aetlis-auth-gate .card{width:min(420px,92vw);background:rgba(20,20,25,.96);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:28px 26px 22px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.5)}"
            + "#aetlis-auth-gate img{width:72px;height:72px;border-radius:16px;background:#5865f2;margin-bottom:12px}"
            + "#aetlis-auth-gate h1{font-size:22px;margin:0 0 8px}"
            + "#aetlis-auth-gate p{margin:0;color:rgba(255,255,255,.62);font-size:14px;line-height:1.45}"
            + "#aetlis-auth-gate button{margin-top:18px;background:#d3371e;border:0;border-radius:4px;box-shadow:0 0 1px 1px #000;color:#dadada;cursor:pointer;font-size:15px;font-weight:600;padding:10px 18px;text-shadow:1px 1px 2px #000}"
            + "#aetlis-auth-gate button:hover{background:#b82e19}"
            + "#aetlis-auth-gate .queue{margin-top:18px;text-align:left}"
            + "#aetlis-auth-gate .queue h2{font-size:13px;font-weight:600;margin:0 0 8px;color:rgba(255,255,255,.5)}"
            + "#aetlis-auth-gate .person{display:flex;align-items:center;gap:8px;margin-top:8px}"
            + "#aetlis-auth-gate .person img{width:32px;height:32px;border-radius:8px;margin:0}"
            + "#aetlis-auth-gate .person span{flex:1;min-width:0;font-size:14px}"
            + "#aetlis-auth-gate .person button{margin-top:0;padding:6px 10px;font-size:13px}";
        (document.documentElement || document.head).appendChild(style);
        root = document.createElement("div");
        root.id = "aetlis-auth-gate";
        (document.documentElement || document.body).appendChild(root);
        return root;
    }

    function show(session, error) {
        lastSession = publicSession(session) || session || null;
        lastError = error || "";
        if (lastSession && lastSession.discordId)
            writeGate(lastSession);
        arm();
        var node = ensure()
            , name = session && session.name ? session.name : ""
            , pending = session && session.status === "pending";
        node.innerHTML = "";
        var card = document.createElement("div");
        card.className = "card";
        if (session && session.avatar) {
            var img = document.createElement("img");
            img.alt = "";
            img.src = session.avatar;
            card.appendChild(img);
        }
        var title = document.createElement("h1");
        title.textContent = pending ? "Waiting for approval" : "Verification required";
        var text = document.createElement("p");
        text.textContent = error
            ? error
            : pending
                ? name + " is signed in. This client stays locked until that Discord account is approved."
                : "Log in with Discord. Access stays locked until that account is approved.";
        card.appendChild(title);
        card.appendChild(text);
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = pending ? "Log out" : "Log in with Discord";
        button.addEventListener("click", function () {
            button.disabled = true;
            chrome.runtime.sendMessage({ type: pending ? "aetlis-auth-logout" : "aetlis-auth-login" }, function (res) {
                button.disabled = false;
                var err = chrome.runtime.lastError;
                apply(err ? { enforce: true, session: null, error: pending ? "" : err.message } : res);
            });
        });
        card.appendChild(button);
        node.appendChild(card);
        if (pending)
            loadQueue(card, session);
    }

    function loadQueue(card, session) {
        chrome.runtime.sendMessage({ type: "aetlis-auth-admin", action: "list" }, function (res) {
            if (chrome.runtime.lastError || !res || !res.ok)
                return;
            var box = document.createElement("div");
            box.className = "queue";
            var heading = document.createElement("h2");
            heading.textContent = "Waiting to be approved";
            box.appendChild(heading);
            var rows = res.rows || [];
            if (!rows.length) {
                var empty = document.createElement("p");
                empty.textContent = "Nobody is waiting.";
                box.appendChild(empty);
            }
            rows.forEach(function (row) {
                var line = document.createElement("div");
                line.className = "person";
                if (row.avatar) {
                    var pic = document.createElement("img");
                    pic.alt = "";
                    pic.src = row.avatar;
                    line.appendChild(pic);
                }
                var label = document.createElement("span");
                label.textContent = row.name + (row.username ? " (@" + row.username + ")" : "");
                var approve = document.createElement("button");
                approve.type = "button";
                approve.textContent = "Approve";
                approve.addEventListener("click", function () {
                    approve.disabled = true;
                    chrome.runtime.sendMessage({ type: "aetlis-auth-admin", action: "approve", discordId: row.id }, function () {
                        if (session && String(session.discordId) === String(row.id)) {
                            chrome.runtime.sendMessage({ type: "aetlis-auth-poll" }, function (next) {
                                if (!chrome.runtime.lastError)
                                    apply(next);
                            });
                            return;
                        }
                        loadQueue(card, session);
                    });
                });
                line.appendChild(label);
                line.appendChild(approve);
                box.appendChild(line);
            });
            var old = card.querySelector(".queue");
            if (old)
                old.parentNode.removeChild(old);
            card.appendChild(box);
        });
    }

    function localEnforce() {
        return !!(self.AETLIS_AUTH && self.AETLIS_AUTH.enforce);
    }

    function ensurePoll() {
        if (poll)
            return;
        poll = setInterval(function () {
            chrome.runtime.sendMessage({ type: "aetlis-auth-poll" }, function (next) {
                if (chrome.runtime.lastError || !next)
                    return;
                apply(next);
            });
        }, 5000);
    }

    function apply(res) {
        var saved;
        decided = true;
        if (res && res.loggedOut)
            clearGate();
        else if (res && res.credentials)
            persistCredentials(res.credentials);
        if (localEnforce() && (!res || !res.enforce)) {
            saved = readGate();
            if (res && res.error)
                res = { ok: false, enforce: true, session: saved, error: res.error };
            else if (saved)
                res = { ok: true, enforce: true, session: saved };
            else
                res = { enforce: true, session: null, error: "Reload this extension on chrome://extensions, then refresh the page." };
        }
        if (res && !res.loggedOut && (!res.session || !res.session.discordId)) {
            saved = readGate();
            if (saved)
                res.session = saved;
        }
        if (res && res.session && res.session.discordId && !res.loggedOut)
            writeGate(res.session);
        tellPage(res || { enforce: false, session: null });
        if (!res || !res.enforce || (res.session && res.session.status === "approved")) {
            hide();
            if (res && res.enforce && res.session && res.session.status === "approved")
                watchRevoke();
            return;
        }
        if (revokeTimer)
            clearInterval(revokeTimer),
            revokeTimer = null;
        var title = root && root.querySelector("h1");
        var showingWait = !!(title && title.textContent === "Waiting for approval");
        var nowWait = !!(res.session && res.session.status === "pending");
        ensurePoll();
        if (locked && root && root.isConnected && !res.error && showingWait === nowWait) {
            var card = root.querySelector(".card");
            if (card)
                loadQueue(card, res.session);
            return;
        }
        show(res.session, res.error || "");
    }

    function watchRevoke() {
        if (revokeTimer)
            return;
        revokeTimer = setInterval(function () {
            chrome.runtime.sendMessage({ type: "aetlis-auth-poll" }, function (next) {
                if (chrome.runtime.lastError || locked)
                    return;
                if (localEnforce() && !(next && next.session && next.session.status === "approved"))
                    apply(next || { enforce: true, session: null });
                else if (next)
                    tellPage(next);
            });
        }, 8000);
    }

    window.addEventListener("message", function (ev) {
        if (ev.source !== window || !ev.data || ev.data.source !== "aetlis-page" || ev.data.type !== "aetlis-auth-admin")
            return;
        chrome.runtime.sendMessage({
            type: "aetlis-auth-admin",
            action: ev.data.action || "list",
            discordId: ev.data.discordId || ""
        }, function (res) {
            window.postMessage({
                source: "aetlis-bridge",
                type: "aetlis-auth-admin-result",
                requestId: ev.data.requestId || "",
                result: chrome.runtime.lastError ? { ok: false } : (res || { ok: false })
            }, "*");
        });
    });

    window.addEventListener("message", function (ev) {
        if (ev.source !== window || !ev.data || ev.data.source !== "aetlis-page" || ev.data.type !== "aetlis-auth-logout")
            return;
        chrome.runtime.sendMessage({ type: "aetlis-auth-logout" }, function (res) {
            var err = chrome.runtime.lastError;
            apply(err ? { enforce: true, session: null } : (res || { enforce: true, session: null }));
            window.postMessage({ source: "aetlis-bridge", type: "aetlis-auth-logout-done" }, "*");
        });
    });

    function requestStatus(tries) {
        try {
            chrome.runtime.sendMessage({ type: "aetlis-auth-status" }, function (res) {
                if (chrome.runtime.lastError || !res) {
                    if (tries < 8)
                        return setTimeout(function () {
                            requestStatus(tries + 1);
                        }, 400);
                    var saved = readGate();
                    if (saved && saved.status !== "approved")
                        apply({ ok: true, enforce: true, session: saved });
                    else if (!saved && localEnforce())
                        apply({ enforce: true, session: null, error: "Reload this extension on chrome://extensions, then refresh the page." });
                    return;
                }
                apply(res);
            });
        } catch (e) {
            var saved = readGate();
            if (saved && saved.status !== "approved")
                apply({ ok: true, enforce: true, session: saved });
            else if (localEnforce())
                apply(null);
        }
    }

    function boot() {
        var saved = readGate();
        if (localEnforce())
            arm();
        if (saved && saved.status !== "approved")
            show(saved, "");
        requestStatus(0);
    }

    if (document.documentElement)
        boot();
    else
        document.addEventListener("DOMContentLoaded", boot);
})();
