function httpGet(Url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function generateUsername(length) {
    for (const name of ["flynn", "tron", "clu", "sam", "quorra", "rinzler"]) {
        if (httpGet("/check/" + name)["status"] === "false") {
            return name;
        }
    }

    var result = "";
    while (true) {
        var characters = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        if (httpGet("/check/" + result)["status"] === "false") {
            return result;
        }
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function initStats(Stats) {
    var stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = "absolute";
    stats.domElement.style.left = "0px";
    stats.domElement.style.top = "0px";
    document.body.appendChild( stats.dom );
    return stats;
}

export { initStats, sleep, generateUsername };
