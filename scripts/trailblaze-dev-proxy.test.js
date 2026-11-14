import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTrailblaze, getTrailblaze } from './trailblaze-dev-proxy.js';

test('decodes references without allowing prototype mutation', () => {
  const value = decodeTrailblaze({ t: 10, i: 0, p: { k: ['a', 'b'], v: [
    { t: 9, i: 1, a: [{ t: 0, s: 7 }] }, { t: 4, i: 1 },
  ] } });
  assert.deepEqual(value.a, [7]);
  assert.equal(value.a, value.b);
  assert.throws(() => decodeTrailblaze({ t: 10, i: 0, p: { k: ['__proto__'], v: [{ t: 2, s: 0 }] } }), /Unsafe/);
});

test('translates three-quarter segment and rejects a mismatched game', async () => {
  let requested;
  const fetcher = async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ t: 10, i: 0, p: { k: ['result'], v: [
      { t: 10, i: 1, p: { k: ['gameId'], v: [{ t: 1, s: '2052609999' }] } },
    ] } }) };
  };
  await assert.rejects(getTrailblaze('game', '2052600011', 'Q1-Q3', fetcher), /identity mismatch/);
  const payload = JSON.parse(requested.searchParams.get('payload'));
  assert.equal(payload.t.p.v[0].p.v[1].s, 'Q1-3');
});

test('treats missing pregame minutes as unavailable', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ p: { k: ['error'], v: [
    { s: { message: { s: 'Game data not found' } } },
  ] } }) });
  await assert.rejects(getTrailblaze('minutes', '2052600033', null, fetcher), (error) => error.status === 404);
});
