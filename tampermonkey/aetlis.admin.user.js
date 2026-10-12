// ==UserScript==
// @name         Aetlis client admin
// @version      1.1.50
// @description  Aetlis client. Admin build. Approvals stay available for owner accounts.
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-end
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.admin.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.admin.user.js
// ==/UserScript==

(async function (base, build) {
    "use strict";
    if (location.hostname !== "aetlis.io" && location.hostname !== "www.aetlis.io")
        return;
    if (window.__aetlisMavor)
        return;
    window.__aetlisMavor = 1;
    window.__aetlisBuild = build || "user";

    function installSpoof() {
        var desc = Object.getOwnPropertyDescriptor(Document.prototype, "currentScript");
        var standIn = document.createElement("script");
        Object.defineProperty(standIn, "src", {
            configurable: true,
            get: function () {
                return location.origin + "/js/main.js";
            }
        });
        if (!desc || !desc.get)
            return;
        Object.defineProperty(Document.prototype, "currentScript", {
            configurable: true,
            get: function () {
                var real = desc.get.call(this);
                if (real && real.getAttribute("data-aetlis-client") === "1")
                    return standIn;
                return real;
            }
        });
    }

    async function load() {
        var css = await fetch(base + "css/style.css").then(function (res) { return res.text(); });
        var style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
        installSpoof();
        var files = ["https://aetlis.io/js/vendor.js", base + "js/main.js"];
        for (var i = 0; i < files.length; i++) {
            var code = await fetch(files[i]).then(function (res) { return res.text(); });
            var script = document.createElement("script");
            script.type = "text/javascript";
            if (i === 1)
                script.setAttribute("data-aetlis-client", "1");
            script.textContent = code;
            document.head.appendChild(script);
        }
    }

    document.open();
    await fetch("https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/menu.txt").then(function (res) { return res.text(); }).then(function (html) { document.write(html); });
    document.close();
    await load();
})("https://aetlis-discord-auth.officialbayvanis.workers.dev/client/", "admin");
