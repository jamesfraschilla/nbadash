// Local-only adapter for evaluating Trailblaze's undocumented server functions.
const IDS = {
  date: '5e684465ef2bfa677fece65d7d87f087c0ec5e703b94335d28641b983e6a2be2',
  game: '0920422c01e6ce658d6037c012db96ff9f5210ca8c6cef99eaa171995ec68de3',
  pbp: '63af8ce24bb95f2422067683b866540ce36042ff5c337f78e7dd20ea4637299d',
  minutes: '86948681cf4aefabfaf1eff19e4a253ef1a987fefd244311452c6fdaea7ffb69',
};
const scalar = (value) => ({ t: 1, s: value });

export function decodeTrailblaze(node, refs = new Map()) {
  if (!node || typeof node !== 'object') throw Error('Invalid serialized response');
  switch (node.t) {
    case 0: return Number(node.s);
    case 1: return String(node.s);
    case 2: return [null, undefined, true, false][node.s];
    case 4:
      if (!refs.has(node.i)) throw Error('Invalid serialized reference');
      return refs.get(node.i);
    case 9: {
      const result = [];
      refs.set(node.i, result);
      for (const entry of node.a) result.push(decodeTrailblaze(entry, refs));
      return result;
    }
    case 10:
    case 11: {
      const result = Object.create(null);
      refs.set(node.i, result);
      if (!Array.isArray(node.p?.k) || !Array.isArray(node.p?.v) || node.p.k.length !== node.p.v.length) throw Error('Invalid serialized properties');
      node.p.k.forEach((key, i) => {
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Unsafe serialized property');
        result[key] = decodeTrailblaze(node.p.v[i], refs);
      });
      return result;
    }
    default: throw Error(`Unsupported serialized type ${node.t}`);
  }
}

export async function getTrailblaze(kind, value, segment = null, fetcher = fetch) {
  if (!IDS[kind]) throw Error('Unknown feed');
  const input = kind === 'game'
    ? { t: 10, i: 1, p: { k: ['gameId', 'segment'], v: [scalar(value), segment ? scalar(segment === 'Q1-Q3' ? 'Q1-3' : segment) : { t: 2, s: 1 }] }, o: 0 }
    : scalar(value);
  const envelope = { t: { t: 10, i: 0, p: { k: ['data'], v: [input] }, o: 0 }, f: 127, m: [] };
  const url = new URL(`https://live.trailblaze.rs/_serverFn/${IDS[kind]}`);
  url.searchParams.set('payload', JSON.stringify(envelope));
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error(`Trailblaze ${kind} returned ${response.status}`);
  const serialized = await response.json();
  if (serialized?.p?.k?.[0] === 'error') {
    const message = serialized?.p?.v?.[0]?.s?.message?.s || 'Feed unavailable';
    throw Object.assign(Error(message), { status: kind === 'minutes' && message === 'Game data not found' ? 404 : 503 });
  }
  const result = decodeTrailblaze(serialized).result;
  if (kind === 'date') {
    if (!Array.isArray(result)) throw Error('Invalid game list');
  } else if (String(result?.gameId) !== value) throw Error('Feed game identity mismatch');
  if (kind === 'game' && (!result.homeTeam?.teamId || !result.awayTeam?.teamId || !result.boxScore)) throw Error('Game data incomplete');
  if (kind === 'pbp' && !Array.isArray(result.playByPlayActions)) throw Error('Play-by-play data incomplete');
  if (kind === 'minutes' && !Array.isArray(result.periods)) throw Error('Minutes data incomplete');
  return result;
}

export function trailblazeDevProxy() {
  return {
    name: 'trailblaze-local-audit-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/local-live-feed', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          if (req.method !== 'GET') throw Object.assign(Error('Method not allowed'), { status: 405 });
          const url = new URL(req.url, 'http://localhost');
          let data;
          if (url.pathname === '/games/byDate') {
            const date = url.searchParams.get('date');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Object.assign(Error('Invalid date'), { status: 400 });
            data = await getTrailblaze('date', date);
          } else {
            const match = url.pathname.match(/^\/games\/(\d{10})(?:\/(playbyplay|minutes))?$/);
            if (!match) throw Object.assign(Error('Unknown route'), { status: 404 });
            const segment = url.searchParams.get('segment');
            if (segment && !['Q1', 'Q2', 'Q3', 'Q4', '1H', '2H', 'Q1-Q3', 'all'].includes(segment)) throw Object.assign(Error('Invalid segment'), { status: 400 });
            const kind = match[2] === 'playbyplay' ? 'pbp' : match[2] || 'game';
            data = await getTrailblaze(kind, match[1], segment === 'all' ? null : segment);
          }
          res.statusCode = 200;
          res.end(JSON.stringify(data));
        } catch (error) {
          res.statusCode = error.status || 503;
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}
