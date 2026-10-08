// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.37
// @description  Loads the Aetlis client from GitHub (jsDelivr) instead of the site copies of main.js and style.css.
// @match        *://aetlis.io/*
// @match        *://*.aetlis.io/*
// @run-at       document-start
// @grant        none
// @updateURL    https://cdn.jsdelivr.net/gh/realbay/mavor-ext@main/tampermonkey/aetlis.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/realbay/mavor-ext@main/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    // jsDelivr serves GitHub files as real scripts. Raw GitHub does not.
    // Repo layout this expects:
    //   js/main.js
    //   css/style.css
    //   tampermonkey/aetlis.user.js
    var GH = "realbay/mavor-ext";
    var VER = "1.1.37";
    if (!GH || GH.indexOf("YOUR_GITHUB") === 0)
        return;
    var BASE = "https://cdn.jsdelivr.net/gh/" + GH + "@main/";
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
