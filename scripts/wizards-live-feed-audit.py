#!/usr/bin/env python3
"""Bounded read-only game audit; one invocation captures an independent sample."""
import concurrent.futures, datetime, gzip, hashlib, json, os, pathlib, subprocess, time
import requests

GAME='0022600217'
ROOT=pathlib.Path(os.environ['AUDIT_OUTPUT']).resolve()
ROOT.mkdir(parents=True,exist_ok=True)
(ROOT/'snapshots').mkdir(exist_ok=True)
KEY=os.environ.get('NBA_API_KEY','')
SUPA=os.environ.get('VITE_SUPABASE_URL','').rstrip('/')
ANON=os.environ.get('VITE_SUPABASE_ANON_KEY','')
NBA='https://api.nba.com/v0/api/'
now=datetime.datetime.now(datetime.timezone.utc)
sources={
 'nba_game':('GET',NBA+'scores/scoreboard/games',{'leagueId':'00','gameId':GAME},None,{'X-NBA-Api-Key':KEY}),
 'nba_box':('GET',NBA+'stats/boxscore',{'gameId':GAME,'measureType':'Traditional'},None,{'X-NBA-Api-Key':KEY}),
 'nba_pbp':('GET',NBA+'stats/pbp',{'gameId':GAME},None,{'X-NBA-Api-Key':KEY}),
 'dashboard_game':('POST',SUPA+'/functions/v1/game-metadata',None,{'primaryGameId':GAME},{'apikey':ANON,'Authorization':'Bearer '+ANON}),
 'dashboard_scoreboard':('POST',SUPA+'/functions/v1/scoreboard',None,{'date':'2026-11-11'},{'apikey':ANON,'Authorization':'Bearer '+ANON}),
}
if now.minute % 5 == 0:
 sources.update({
  'nba_advanced':('GET',NBA+'stats/boxscore',{'gameId':GAME,'measureType':'Advanced'},None,{'X-NBA-Api-Key':KEY}),
  'nba_rosterlineup':('GET',NBA+'stats/rosterlineup',{'gameId':GAME},None,{'X-NBA-Api-Key':KEY}),
  'nba_poc':('GET',NBA+'stats/poc',{'gameId':GAME},None,{'X-NBA-Api-Key':KEY}),
  'dashboard_minutes':('POST',SUPA+'/functions/v1/game-metadata',None,{'minutesGameId':GAME},{'apikey':ANON,'Authorization':'Bearer '+ANON}),
 })
def capture(item):
 name,(method,url,params,body,headers)=item; started=time.monotonic(); record={'source':name,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  r=requests.request(method,url,params=params,json=body,headers=headers,timeout=(5,22));record.update(http=r.status_code,ms=round((time.monotonic()-started)*1000),bytes=len(r.content))
  if len(r.content)<=5_000_000:
   digest=hashlib.sha256(r.content).hexdigest(); file=ROOT/'snapshots'/f'{name}-{digest}.json.gz'
   if not file.exists():
    with gzip.open(file,'wb') as f:f.write(r.content)
   record['snapshot']=str(file.relative_to(ROOT))
  r.raise_for_status()
  if r.status_code == 204:
   record['pending']=True
   return record
  j=r.json()
  if name in ('nba_poc','nba_rosterlineup'):
   if not isinstance(j,list):raise ValueError('Expected a list of lineup records')
   record['rows']=len(j)
   record['rowFields']=list(j[0].keys()) if j and isinstance(j[0],dict) else []
   return record
  if name=='nba_game':g=next((x for x in (j.get('scoreboard') or {}).get('games',[]) if str(x.get('gameId'))==GAME),{})
  elif name=='dashboard_scoreboard':g=next((x for x in j if str(x.get('gameId'))==GAME),{}) if isinstance(j,list) else {}
  elif name=='dashboard_game':g=j.get('game') or {}
  elif name=='dashboard_minutes':g=j.get('minutes') or {}
  else:g=j
  if str(g.get('gameId','')) not in (GAME,'') or (name in ('nba_game','dashboard_game','dashboard_scoreboard','dashboard_minutes') and str(g.get('gameId',''))!=GAME):raise ValueError('Game identity mismatch or game not present')
  record.update(gameId=g.get('gameId'),gameStatus=g.get('gameStatus'),period=g.get('period'),clock=g.get('gameClock'),away=(g.get('awayTeam') or {}).get('score'),home=(g.get('homeTeam') or {}).get('score'),feedSource=(g.get('feedAvailability') or {}).get('source'))
  if name in ('nba_pbp','dashboard_game'):
   plays=g.get('actions') if name=='nba_pbp' else g.get('playByPlayActions');record['plays']=len(plays or []);record['lastAction']=(plays or [])[-1] if plays else None
  if name in ('nba_box','nba_advanced'):
   for side in ('home','away'):
    t=g.get(side+'Team') or {};s=t.get('statistics') or {};record[side+'TeamId']=t.get('teamId');record[side+'Players']=len(t.get('players') or []);record[side+'Points']=s.get('points');record[side+'Possessions']=s.get('poss');record[side+'StatisticFields']=[k for k,v in s.items() if v is not None]
  if name=='dashboard_minutes':record['periods']=len(g.get('periods') or []);record['stints']=[len(x.get('stints') or []) for x in (g.get('periods') or [])]
 except Exception as e:
  record['error']=type(e).__name__+': '+str(e).split(' for url:')[0][:180]
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=9) as ex: results=list(ex.map(capture,sources.items()))
batch={'sampledAt':now.isoformat(),'gameId':GAME,'results':results}
with (ROOT/'timeline.jsonl').open('a') as f:f.write(json.dumps(batch,default=str)+'\n')
(ROOT/'latest.json').write_text(json.dumps(batch,indent=2,default=str)+'\n')
print('SAMPLE',now.isoformat(),flush=True)
for x in results:
 print('SOURCE',json.dumps({k:x[k] for k in ('source','feedSource','http','error','pending','rows','rowFields','gameStatus','period','clock','away','home','plays','periods','stints','homePossessions','awayPossessions') if k in x},default=str),flush=True)
try:
 result=subprocess.run(['node',str(pathlib.Path(__file__).with_name('wizards-live-processing.mjs'))],env={**os.environ,'AUDIT_OUTPUT':str(ROOT)},capture_output=True,text=True,timeout=20)
 print(result.stdout.strip() or ('PROCESSING_ERROR '+result.stderr.strip()[:300]),flush=True)
except Exception as e:print('PROCESSING_ERROR',type(e).__name__,flush=True)
