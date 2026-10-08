onmessage = function(e) {
    var a;
    a = e.data,
    fetch(a, {
        mode: "cors"
    }).then((e => e.blob())).then((e => createImageBitmap(e))).then((e => self.postMessage({
        a,
        b: e
    }))).catch((e => self.postMessage({
        a,
        c: e
    })))
}
;
