// Negociación de compresión y validación de caché para CSS estático.
'use strict';
function acceptsGzip(header) {
    if (!header) return false;
    const qualities = new Map();
    for (const entry of header.split(',')) {
        const [name, ...parameters] = entry.trim().split(';');
        const token = name.trim().toLowerCase();
        if (!token) continue;
        const quality = parameters.find(p => /^\s*q\s*=/i.test(p));
        const q = quality ? Number(quality.split('=')[1].trim()) : 1;
        qualities.set(token, Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0);
    }
    return (qualities.has('gzip') ? qualities.get('gzip') : (qualities.get('*') || 0)) > 0;
}
function matchesETag(header, etag) {
    if (!header) return false;
    return header.split(',').some(raw => {
        const tag = raw.trim();
        return tag === '*' || tag === etag || tag === 'W/' + etag;
    });
}
module.exports = { acceptsGzip, matchesETag };
