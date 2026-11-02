const assert = require('node:assert/strict');
const { acceptsGzip, matchesETag } = require('../lib/css-http-cache');
for (const [header, expected] of [
  [undefined, false], ['gzip', true], ['br, gzip;q=0.5', true],
  ['gzip;q=0', false], ['gzip;q=0, *;q=1', false],
  ['br, *;q=0.8', true], ['br, *;q=0', false],
  ['GZIP; Q=1', true], ['gzip;q=2', false], ['gzip;q=abc', false]
]) assert.equal(acceptsGzip(header), expected, String(header));
const etag = '"abc"';
assert.equal(matchesETag('"abc"', etag), true);
assert.equal(matchesETag('W/"abc"', etag), true);
assert.equal(matchesETag('"old", "abc"', etag), true);
assert.equal(matchesETag('*', etag), true);
assert.equal(matchesETag('"other"', etag), false);
console.log('CSS HTTP cache: 15 casos aprobados');
