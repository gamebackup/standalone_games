const originalFetch = window.fetch;
var progressTotal = 0;
var progressLoaded = 0;

function mergeFiles(fileParts, onProgress) {
    return new Promise((resolve, reject) => {
        let buffers = [];

        function fetchPart(index) {
            if (index >= fileParts.length) {
                let mergedBlob = new Blob(buffers);
                let mergedFileUrl = URL.createObjectURL(mergedBlob);
                resolve(mergedFileUrl);
                return;
            }
            fetch(fileParts[index]).then((response) => {
                if (!response.ok) throw new Error("Missing part: " + fileParts[index]);
                return response.arrayBuffer();
            }).then((data) => {
                buffers.push(data);
                progressLoaded++;
                if (onProgress) onProgress(progressLoaded, progressTotal);
                fetchPart(index + 1);
            }).catch(reject);
        }
        fetchPart(0);
    });
}

function getParts(file, start, end) {
    let parts = [];
    for (let i = start; i <= end; i++) {
        parts.push(file + ".part" + i);
    }
    return parts;
}

var pckParts = getParts("buckshot-roulette.pck", 1, 17);
var wasmParts = getParts("buckshot-roulette.wasm", 1, 3);
progressTotal = pckParts.length + wasmParts.length;

var onProgress = window.__buckshotProgress;

Promise.all([
    mergeFiles(pckParts, onProgress),
    mergeFiles(wasmParts, onProgress)
]).then(([pckUrl, wasmUrl]) => {
    window.fetch = async function (url, ...args) {
        if (url.endsWith("buckshot-roulette.pck")) {
            return originalFetch(pckUrl, ...args);
        } else if (url.endsWith("buckshot-roulette.wasm")) {
            return originalFetch(wasmUrl, ...args);
        } else {
            return originalFetch(url, ...args);
        }
    };
    window.godotRunStart();
});