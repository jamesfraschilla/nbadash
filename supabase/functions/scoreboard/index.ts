import { fetchScoreboard } from '../_shared/scoreboard.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  const body = await req.json().catch(() => ({}));
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return Response.json({ error: 'Invalid game date' }, { status: 400, headers: cors });
  try {
    const games = await fetchScoreboard(body.date, Deno.env.get('NBA_API_KEY') || '');
    return Response.json(games, { headers: { ...cors, 'Cache-Control': 'private, max-age=10' } });
  } catch (error) {
    console.error('Scoreboard request failed', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Scoreboard temporarily unavailable' }, { status: 503, headers: cors });
  }
});
