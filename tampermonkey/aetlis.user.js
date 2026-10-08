// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.37
// @description  Loads the Aetlis client instead of the site copies of main.js and style.css.
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    // Served by the Cloudflare worker so the GitHub repo can stay private.
    // jsDelivr only works for public repos, and raw GitHub blocks scripts.
    var VER = "1.1.37";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";
    function mapUrl(url) {
        var path = "";
        try {
            path = new URL(String(url || ""), location.href).pathname
        } catch (e) {
            return url
        }
        if (/\/js\/main\.js$/.test(path))
            return BASE + "js/main.js?v=" + VER;
        if (/\/css\/style\.css$/.test(path))
            return BASE + "css/style.css?v=" + VER;
        return url
    }
    function hook(proto, prop) {
        var desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc || !desc.set || !desc.get)
            return;
        Object.defineProperty(proto, prop, {
            configurable: !0,
            enumerable: desc.enumerable,
            get: function () {
                return desc.get.call(this)
            },
            set: function (value) {
                desc.set.call(this, mapUrl(value))
            }
        })
    }
    hook(HTMLScriptElement.prototype, "src");
    hook(HTMLLinkElement.prototype, "href");
    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        if (("src" === name || "href" === name) && (this instanceof HTMLScriptElement || this instanceof HTMLLinkElement))
            value = mapUrl(value);
        return setAttribute.call(this, name, value)
    }
})();
