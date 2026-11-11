#!/usr/bin/env python3
"""Read-only, single-game feed audit. A scheduler runs one bounded sample at a time."""
import concurrent.futures, datetime, gzip, hashlib, json, os, pathlib, re, subprocess, sys, time
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
import requests

ROOT = pathlib.Path(os.environ.get('AUDIT_OUTPUT', 'output/gleague-feed-audit-2052600033')).resolve()
GAME = '2052600033'
ESPN_GAME = '401914529'  # Matched by teams and tip time; not the NBA game ID.
ET = ZoneInfo('America/New_York')
IDS = {'schedule':'5e684465ef2bfa677fece65d7d87f087c0ec5e703b94335d28641b983e6a2be2', 'game':'0920422c01e6ce658d6037c012db96ff9f5210ca8c6cef99eaa171995ec68de3', 'pbp':'63af8ce24bb95f2422067683b866540ce36042ff5c337f78e7dd20ea4637299d', 'minutes':'86948681cf4aefabfaf1eff19e4a253ef1a987fefd244311452c6fdaea7ffb69'}
HEADERS = {'Accept':'application/json','User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/'}

def decode(n, refs):
    t = n['t']
    if t in (0, 1): return n['s']
    if t == 2: return {0:None,1:None,2:True,3:False}[n['s']]
    if t == 4: return refs[n['i']]
    if t == 9:
        v=[]; refs[n['i']]=v; v.extend(decode(x,refs) for x in n['a']); return v
    if t in (10,11):
        v={}; refs[n['i']]=v
        for k,x in zip(n['p']['k'],n['p']['v']): v[k]=decode(x,refs)
        return v
    raise ValueError('unsupported Trailblaze serialization type ' + str(t))

def trail_url(kind):
    scalar=lambda x: {'t':1,'s':x}
    if kind == 'game':
        data={'t':10,'i':1,'p':{'k':['gameId','segment'],'v':[scalar(GAME),{'t':2,'s':1}]},'o':0}
    else: data=scalar('2026-11-11' if kind=='schedule' else GAME)
    payload={'t':{'t':10,'i':0,'p':{'k':['data'],'v':[data]},'o':0},'f':127,'m':[]}
    return 'https://live.trailblaze.rs/_serverFn/'+IDS[kind]+'?'+urlencode({'payload':json.dumps(payload,separators=(',',':'))})

def config():
    env={k:os.environ[k] for k in ('VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY') if os.environ.get(k)}
    for filename in (ROOT.parent.parent/'nba_dashboard' / '.env', ROOT.parent.parent/'nba_dashboard' / '.env.local', ROOT/'.private-env'):
        if filename.exists():
            for line in filename.read_text().splitlines():
                k, sep, v=line.partition('=')
                if sep and k in ('VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'): env[k]=v.strip().strip('"\'')
    return env

def definitions():
    base='https://stats.gleague.nba.com/stats/'
    score='scoreboardv2?GameDate=11%2F11%2F2026&LeagueID=20&DayOffset=0'
    args='GameID='+GAME+'&StartPeriod=0&EndPeriod=14&StartRange=0&EndRange=0&RangeType=0'
    espn='https://site.api.espn.com/apis/site/v2/sports/basketball/nba-development/'
    sources={**{'trail_'+k:('GET',trail_url(k),None,{}) for k in IDS},
      'gleague_scoreboard':('GET',base+score,None,HEADERS),
      'gleague_pbp':('GET',base+'playbyplayv3?GameID='+GAME+'&StartPeriod=0&EndPeriod=14',None,HEADERS),
      'gleague_box':('GET',base+'boxscoretraditionalv3?'+args,None,HEADERS),
      'gleague_rotation':('GET',base+'gamerotation?GameID='+GAME+'&LeagueID=20',None,HEADERS),
      'espn_scoreboard':('GET',espn+'scoreboard?dates=20261111',None,{}),
      'espn_summary':('GET',espn+'summary?event='+ESPN_GAME,None,{}),
      'old_cloudfront':('GET','https://d1rjt2wyntx8o7.cloudfront.net/api/games/'+GAME,None,{}),
      'nba_cdn_pbp':('GET','https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_'+GAME+'.json',None,HEADERS)}
    env=config(); url=env.get('VITE_SUPABASE_URL'); key=env.get('VITE_SUPABASE_ANON_KEY')
    if url and key: sources['dashboard_backup']=('POST',url.rstrip('/')+'/functions/v1/game-metadata',{'liveGameId':GAME},{'apikey':key,'Authorization':'Bearer '+key})
    return sources

def measure(item):
    name,(method,url,body,headers)=item; start=time.monotonic()
    record={'source':name,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        r=requests.request(method,url,json=body,headers=headers,timeout=(4,12)); record.update(status=r.status_code,ms=round(1000*(time.monotonic()-start)),bytes=len(r.content),age=r.headers.get('Age'),cache_control=r.headers.get('Cache-Control'))
        # Preserve the provider response before decoding or validation, including
        # error responses. One malformed feed must never erase the evidence.
        if len(r.content) <= 5_000_000:
            rawhash=hashlib.sha256(r.content).hexdigest()
            rawfile=ROOT/'snapshots'/(name+'-raw-'+rawhash+'.bin.gz')
            if not rawfile.exists():
                with gzip.open(rawfile,'wb') as f: f.write(r.content)
            record['raw_snapshot']=str(rawfile.relative_to(ROOT))
        else: record['raw_snapshot_error']='response exceeded 5 MB capture limit'
        r.raise_for_status(); data=r.json()
        if name.startswith('trail_'):
            if data.get('p',{}).get('k')==['error']:
                error=data['p']['v'][0].get('s',{}).get('message',{}).get('s','Unknown upstream error')
                raise ValueError('Trailblaze server function: '+str(error))
            data=decode(data,{})['result']
        if name=='trail_schedule': data=next((x for x in data if str(x.get('gameId'))==GAME),None)
        if name=='espn_scoreboard': data=next((x for x in data.get('events',[]) if x.get('id')==ESPN_GAME),None)
        if data is None: raise ValueError('target game absent')
        record.update(summarize(name,data))
        raw=json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode(); digest=hashlib.sha256(raw).hexdigest(); record['sha256']=digest
        filename=ROOT/'snapshots'/(name+'-'+digest+'.json.gz')
        if not filename.exists():
            with gzip.open(filename,'wb') as f: f.write(raw)
        record['snapshot']=str(filename.relative_to(ROOT))
    except Exception as e:
        record['error']=type(e).__name__+': '+str(e).split(' for url:')[0][:200]
        record.setdefault('ms',round(1000*(time.monotonic()-start)))
    return record

def summarize(name,data):
    out={}
    if name in ('trail_game','trail_schedule','dashboard_backup'):
        g=data.get('game',data); out.update(game_id=g.get('gameId'),game_status=g.get('gameStatus'),period=g.get('period'),clock=g.get('gameClock'),home=(g.get('homeTeam') or {}).get('score'),away=(g.get('awayTeam') or {}).get('score'),actions=len(g.get('playByPlayActions') or []))
        if str(g.get('gameId'))!=GAME: raise ValueError('game identity mismatch')
        out['home_box_players']=len(((g.get('boxScore') or {}).get('home') or {}).get('players') or [])
        out['away_box_players']=len(((g.get('boxScore') or {}).get('away') or {}).get('players') or [])
    elif name=='trail_pbp':
        if str(data.get('gameId'))!=GAME: raise ValueError('PBP identity mismatch')
        a=data.get('playByPlayActions') or []; out.update(game_id=GAME,actions=len(a),last_action=a[-1] if a else None)
    elif name=='trail_minutes':
        if str(data.get('gameId'))!=GAME: raise ValueError('minutes identity mismatch')
        p=data.get('periods') or []; out.update(game_id=GAME,periods=len(p),stints=[len(x.get('stints') or []) for x in p])
    elif name=='gleague_pbp':
        g=data.get('game') or {}; a=g.get('actions') or []; out.update(game_id=g.get('gameId'),actions=len(a),last_action=a[-1] if a else None)
        if str(g.get('gameId'))!=GAME: raise ValueError('G League PBP identity mismatch')
    elif name=='gleague_box':
        g=data.get('boxScoreTraditional') or {}; out.update(game_id=g.get('gameId'),home_box_players=len((g.get('homeTeam') or {}).get('players') or []),away_box_players=len((g.get('awayTeam') or {}).get('players') or []))
        if g.get('gameId') and str(g['gameId'])!=GAME: raise ValueError('G League box identity mismatch')
    elif name in ('gleague_rotation','gleague_scoreboard'):
        sets=data.get('resultSets') or []; out['rows']={s.get('name'):len(s.get('rowSet') or []) for s in sets}
    elif name=='espn_scoreboard':
        c=(data.get('competitions') or [{}])[0]; out.update(event_id=data.get('id'),game_status=(c.get('status') or {}).get('type'),competitors=[{'side':x.get('homeAway'),'score':x.get('score'),'team':(x.get('team') or {}).get('displayName')} for x in c.get('competitors',[])])
    elif name=='espn_summary': out.update(event_id=ESPN_GAME,keys=list(data.keys()),plays=len(data.get('plays') or []))
    return out

def main():
    now=datetime.datetime.now(ET)
    if now.date()!=datetime.date(2026,11,11) or now.hour>=18: print('Audit window closed'); return
    (ROOT/'snapshots').mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(measure,definitions().items()))
    batch={'sampled_at':now.isoformat(),'game_id':GAME,'results':results}
    with (ROOT/'timeline.jsonl').open('a') as f: f.write(json.dumps(batch,default=str)+'\n')
    (ROOT/'latest.json').write_text(json.dumps(batch,indent=2,default=str)+'\n')
    print(now.isoformat(), ' '.join(x['source']+':'+str(x.get('status','network'))+('/error' if x.get('error') else '') for x in results),flush=True)

if __name__=='__main__': main()
