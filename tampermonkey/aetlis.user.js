// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.43
// @description  Opens the Aetlis client the same way the Vanis loader does.
// @include      *://aetlis.io/*
// @include      *://*.aetlis.io/*
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    "use strict";
    var host = location.hostname;
    if (host !== "aetlis.io" && host !== "www.aetlis.io")
        return;

    // vanis.io/ea is a real page. /mavor is only a 404, so the script never starts there.
    var target = "https://aetlis.io/?mavor";
    var path = location.pathname.replace(/\/+$/, "") || "/";
    var onClient = host === "aetlis.io" && path === "/" && /(?:^|[?&])mavor(?:&|$)/.test(location.search);
    if (!onClient) {
        window.stop();
        location.href = target;
        return;
    }
    if (window.__aetlisMavor)
        return;
    window.__aetlisMavor = 1;

    var VER = "1.1.43";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";

    function dropOriginal(node) {
        if (!node || node.nodeType !== 1 || !node.getAttribute)
            return;
        var src = node.getAttribute("src") || node.getAttribute("href") || "";
        if ((node.tagName === "SCRIPT" && /js\/(?:main|vendor)\.js/i.test(src)) || (node.tagName === "LINK" && /css\/style\.css/i.test(src)))
            node.remove();
    }

    var blocker = new MutationObserver(function (list) {
        list.forEach(function (rec) {
            rec.addedNodes.forEach(dropOriginal);
        });
    });
    blocker.observe(document, { childList: true, subtree: true });

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

    // custom-loader.user.js fetches the page first, then opens and writes it. Stopping first leaves a blank page.
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
        blocker.disconnect();
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
