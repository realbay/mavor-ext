// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.39
// @description  Loads the Aetlis client instead of the site copies of main.js and style.css.
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    "use strict";
    var VER = "1.1.39";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";
    var HOST = "officialbayvanis.workers.dev";

    function pathOf(url) {
        try {
            return new URL(String(url || ""), location.href).pathname;
        } catch (ignore) {
            return "";
        }
    }

    function isMain(url) {
        return String(url).indexOf(HOST) === -1 && /\/js\/main\.js$/.test(pathOf(url));
    }

    function isCss(url) {
        return String(url).indexOf(HOST) === -1 && /\/css\/style\.css$/.test(pathOf(url));
    }

    // The client decides where to load wasm from document.currentScript.
    // Point that at aetlis.io even though the script file comes from the worker.
    var currentDesc = Object.getOwnPropertyDescriptor(Document.prototype, "currentScript");
    var standIn = document.createElement("script");
    Object.defineProperty(standIn, "src", {
        configurable: true,
        get: function () {
            return location.origin + "/js/main.js";
        }
    });
    if (currentDesc && currentDesc.get) {
        Object.defineProperty(Document.prototype, "currentScript", {
            configurable: true,
            get: function () {
                var real = currentDesc.get.call(this);
                if (real && real.getAttribute("data-aetlis-client") === "1")
                    return standIn;
                return real;
            }
        });
    }

    function swapScript(node) {
        var src = node.getAttribute("src") || "";
        if (!isMain(src) || node.getAttribute("data-aetlis-client") === "1")
            return;
        node.setAttribute("data-aetlis-client", "1");
        node.src = BASE + "js/main.js?v=" + VER;
    }

    function swapLink(node) {
        var href = node.getAttribute("href") || "";
        if (!isCss(href) || node.getAttribute("data-aetlis-client") === "1")
            return;
        node.setAttribute("data-aetlis-client", "1");
        node.href = BASE + "css/style.css?v=" + VER;
    }

    function visit(node) {
        if (!node || node.nodeType !== 1)
            return;
        if (node.tagName === "SCRIPT")
            swapScript(node);
        else if (node.tagName === "LINK")
            swapLink(node);
        if (!node.querySelectorAll)
            return;
        var scripts = node.querySelectorAll("script[src]");
        var i;
        for (i = 0; i < scripts.length; i++)
            swapScript(scripts[i]);
        var links = node.querySelectorAll("link[href]");
        for (i = 0; i < links.length; i++)
            swapLink(links[i]);
    }

    var obs = new MutationObserver(function (list) {
        var i, j, nodes;
        for (i = 0; i < list.length; i++) {
            nodes = list[i].addedNodes;
            for (j = 0; j < nodes.length; j++)
                visit(nodes[j]);
        }
    });

    if (document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
        visit(document.documentElement);
    } else {
        obs.observe(document, { childList: true, subtree: true });
    }
})();
