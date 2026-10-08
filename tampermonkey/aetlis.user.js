// ==UserScript==
// @name         Aetlis client
// @namespace    aetlis
// @version      1.1.41
// @description  Opens the Aetlis client at aetlis.io/mavor.
// @match        *://aetlis.io/mavor
// @match        *://aetlis.io/mavor/
// @match        *://aetlis.io/mavor?*
// @match        *://*.aetlis.io/mavor
// @match        *://*.aetlis.io/mavor/
// @match        *://*.aetlis.io/mavor?*
// @run-at       document-start
// @grant        none
// @updateURL    https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// @downloadURL  https://aetlis-discord-auth.officialbayvanis.workers.dev/tampermonkey/aetlis.user.js
// ==/UserScript==

(function () {
    "use strict";
    var path = location.pathname.replace(/\/+$/, "");
    if (path !== "/mavor")
        return;

    var VER = "1.1.41";
    var BASE = "https://aetlis-discord-auth.officialbayvanis.workers.dev/";
    var HOST = "officialbayvanis.workers.dev";
    var KEY = "aetlis-mavor";

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

    if (sessionStorage.getItem(KEY) === "1" || (document.documentElement && document.documentElement.getAttribute("data-mavor") === "1")) {
        sessionStorage.removeItem(KEY);
        installSpoof();
        return;
    }

    // /mavor is a 404, so nothing on it races the script. Build the real menu here.
    window.stop();
    fetch(location.origin + "/").then(function (res) {
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
        var boot = "<script>(function(){try{sessionStorage.removeItem('" + KEY + "')}catch(e){}var d=Object.getOwnPropertyDescriptor(Document.prototype,'currentScript');var s=document.createElement('script');Object.defineProperty(s,'src',{configurable:true,get:function(){return location.origin+'/js/main.js';}});if(d&&d.get)Object.defineProperty(Document.prototype,'currentScript',{configurable:true,get:function(){var r=d.get.call(this);if(r&&r.getAttribute('data-aetlis-client')==='1')return s;return r;}});})();<\/script>";
        next = next.replace(/<html\b/i, '<html data-mavor="1"');
        next = next.replace(/<head[^>]*>/i, function (open) {
            return open + '<base href="' + location.origin + '/">' + boot;
        });
        sessionStorage.setItem(KEY, "1");
        document.open();
        document.write(next);
        document.close();
    }).catch(function () {
        sessionStorage.removeItem(KEY);
    });
})();
