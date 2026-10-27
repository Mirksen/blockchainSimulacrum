import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeCapture, parseManifest, verifyAsset, verifyHeaders, verifyToken } from '../../scripts/production-acceptance.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const token = 'phc_syntheticproject';
const manifest = () => ({ source: 'a'.repeat(40), files: ['/index.html', '/vite.svg', '/assets/fixture.js', '/assets/fixture.css']
  .map(path => ({ path, sha256: digest('synthetic asset') })) });

describe('public release proof guards', () => {
  it('accepts a complete fixed-origin release manifest', () => {
    expect(parseManifest(JSON.stringify(manifest())).files).toHaveLength(4);
  });
  it.each(['https://other.example/fixture.js', '//other.example/fixture.js', '/assets/../fixture.js'])('rejects an unsafe asset path %s', path => {
    const value = manifest(); value.files[2].path = path;
    expect(() => parseManifest(JSON.stringify(value))).toThrow();
  });
  it('rejects incomplete, duplicate or malformed manifest entries', () => {
    const incomplete = manifest(); incomplete.files.pop(); expect(() => parseManifest(JSON.stringify(incomplete))).toThrow();
    const duplicate = manifest(); duplicate.files[3] = duplicate.files[2]; expect(() => parseManifest(JSON.stringify(duplicate))).toThrow();
    const malformed = manifest(); malformed.files[0].sha256 = 'synthetic'; expect(() => parseManifest(JSON.stringify(malformed))).toThrow();
  });
  it('rejects different public bytes before browser interaction', () => {
    expect(() => verifyAsset('synthetic asset', digest('synthetic asset'))).not.toThrow();
    expect(() => verifyAsset('changed synthetic asset', digest('synthetic asset'))).toThrow();
  });
  it('requires the selected public token fingerprint without accepting secret formats', () => {
    expect(() => verifyToken(token, digest(token))).not.toThrow();
    expect(() => verifyToken('phc_otherfixture', digest(token))).toThrow();
    expect(() => verifyToken('phx_syntheticsecret', digest('phx_syntheticsecret'))).toThrow();
  });
  it('blocks capture outside the explicit synthetic consent window', () => {
    expect(() => authorizeCapture({ api_key: token }, digest(token), true)).not.toThrow();
    expect(() => authorizeCapture({ api_key: token }, digest(token), false)).toThrow();
    expect(() => authorizeCapture({ api_key: 'phc_otherfixture' }, digest(token), true)).toThrow();
  });
  it('requires the declared published security headers', () => {
    const headers = new Headers({ 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
    expect(() => verifyHeaders(headers, "default-src 'self'")).not.toThrow();
    headers.set('content-security-policy', "default-src *");
    expect(() => verifyHeaders(headers, "default-src 'self'")).toThrow();
  });
});
