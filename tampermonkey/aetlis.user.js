// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.42
// @description  Opens the Aetlis client at aetlis.io/mavor.
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    "use strict";
    var path = location.pathname.replace(/\/+$/, "");
    if (path !== "/mavor") {
        window.stop();
        location.replace(location.origin + "/mavor");
        return;
    }
    if (window.__aetlisMavor)
        return;
    window.__aetlisMavor = 1;

    var VER = "1.1.42";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";

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

    function addCode(code, client) {
        var script = document.createElement("script");
        if (client)
            script.setAttribute("data-aetlis-client", "1");
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
    }

    // Same idea as the Vanis loader: wipe the 404, write the menu, then run the scripts inline.
    window.stop();
    document.open();
    fetch(location.origin + "/").then(function (res) {
        return res.text();
    }).then(function (html) {
        var vendorMatch = html.match(/src=["']([^"']*js\/vendor\.js[^"']*)["']/i);
        var vendorUrl = vendorMatch ? new URL(vendorMatch[1], location.origin + "/").href : location.origin + "/js/vendor.js";
        var next = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*js\/(?:main|vendor)\.js[^"']*["'][^>]*>\s*<\/script>/gi, "");
        next = next.replace(/<link\b[^>]*\bhref\s*=\s*["'][^"']*css\/style\.css[^"']*["'][^>]*>/gi, "");
        next = next.replace(/<head[^>]*>/i, function (open) {
            return open + '<base href="' + location.origin + '/">';
        });
        document.write(next);
        document.close();
        installSpoof();
        return fetch(BASE + "css/style.css?v=" + VER).then(function (res) {
            return res.text();
        }).then(function (css) {
            var style = document.createElement("style");
            style.textContent = css;
            document.head.appendChild(style);
            return fetch(vendorUrl).then(function (res) {
                return res.text();
            });
        }).then(function (vendor) {
            addCode(vendor, false);
            return fetch(BASE + "js/main.js?v=" + VER).then(function (res) {
                return res.text();
            });
        }).then(function (main) {
            addCode(main, true);
        });
    }).catch(function (err) {
        document.open();
        document.write("<p>Aetlis client failed to load.</p>");
        document.close();
        console.error(err);
    });
})();
