// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.40
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
    var VER = "1.1.40";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";
    var HOST = "officialbayvanis.workers.dev";
    var KEY = "aetlis-client-rewritten";

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

    function already() {
        if (sessionStorage.getItem(KEY) === "1")
            return true;
        return !!document.querySelector("[data-aetlis-client]");
    }

    if (already()) {
        sessionStorage.removeItem(KEY);
        installSpoof();
        return;
    }

    // Chrome fetches main.js from the HTML before a userscript can edit the tag.
    // Stop that load and write the page again with the worker files in place.
    window.stop();
    fetch(location.href).then(function (res) {
        return res.text();
    }).then(function (html) {
        var main = BASE + "js/main.js?v=" + VER;
        var css = BASE + "css/style.css?v=" + VER;
        var next = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])([^"']*js\/main\.js[^"']*)(["'])/i, function (full, pre, url, post) {
            if (url.indexOf(HOST) !== -1)
                return full;
            return pre + main + '" data-aetlis-client="1' + post;
        });
        next = next.replace(/(<link\b[^>]*\bhref\s*=\s*["'])([^"']*css\/style\.css[^"']*)(["'])/i, function (full, pre, url, post) {
            if (url.indexOf(HOST) !== -1)
                return full;
            return pre + css + '" data-aetlis-client="1' + post;
        });
        if (next === html)
            return;
        var boot = "<script>(function(){var d=Object.getOwnPropertyDescriptor(Document.prototype,'currentScript');var s=document.createElement('script');Object.defineProperty(s,'src',{configurable:true,get:function(){return location.origin+'/js/main.js';}});if(d&&d.get)Object.defineProperty(Document.prototype,'currentScript',{configurable:true,get:function(){var r=d.get.call(this);if(r&&r.getAttribute('data-aetlis-client')==='1')return s;return r;}});})();<\/script>";
        next = next.replace(/<head[^>]*>/i, function (open) {
            return open + boot;
        });
        next = next.replace(/<\/body>/i, "<script>try{sessionStorage.removeItem('" + KEY + "')}catch(e){}<\/script></body>");
        sessionStorage.setItem(KEY, "1");
        document.open();
        document.write(next);
        document.close();
    }).catch(function () {
        sessionStorage.removeItem(KEY);
    });
})();
