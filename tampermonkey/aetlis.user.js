// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.44
// @description  Replaces the Aetlis page with the client after it loads.
// @include      *://aetlis.io/*
// @include      *://*.aetlis.io/*
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    "use strict";
    var host = location.hostname;
    if (host !== "aetlis.io" && host !== "www.aetlis.io") {
        location.href = "https://aetlis.io/";
        return;
    }
    if (window.__aetlisMavor)
        return;
    window.__aetlisMavor = 1;

    var VER = "1.1.44";
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
        document.open();
        document.write(next);
        document.close();
        installSpoof();
        return fetch(BASE + "css/style.css?v=" + VER).then(function (res) {
            if (!res.ok)
                throw new Error("style " + res.status);
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
                if (!res.ok)
                    throw new Error("main " + res.status);
                return res.text();
            });
        }).then(function (main) {
            addCode(main, true);
        });
    }).catch(function (err) {
        window.__aetlisMavor = 0;
        document.open();
        document.write("<p>Aetlis client failed to load. Allow aetlis-discord-auth.officialbayvanis.workers.dev in your ad blocker, then try again.</p>");
        document.close();
        console.error(err);
    });
})();
