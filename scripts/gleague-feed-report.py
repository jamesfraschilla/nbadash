#!/usr/bin/env python3
"""Summarize the independent samples; retain raw captures for deeper review."""
import collections, datetime, json, os, pathlib
ROOT=pathlib.Path(os.environ.get('AUDIT_OUTPUT', 'output/gleague-feed-audit-2052600033')).resolve()
path=ROOT/'timeline.jsonl'
if not path.exists(): raise SystemExit('No samples yet')
samples=[]
for line in path.read_text().splitlines():
    try: samples.append(json.loads(line))
    except json.JSONDecodeError: print('Ignored incomplete timeline line')
sources=collections.defaultdict(list)
for sample in samples:
    for result in sample['results']: sources[result['source']].append((sample['sampled_at'],result))
print('Game 2052600033; samples:',len(samples),'from',samples[0]['sampled_at'],'to',samples[-1]['sampled_at'])
for name,records in sources.items():
    success=[(t,r) for t,r in records if r.get('status')==200 and not r.get('error')]
    errors=collections.Counter(r.get('error','HTTP '+str(r.get('status'))) for _,r in records if r.get('error') or r.get('status')!=200)
    changes=sum(a[1].get('sha256')!=b[1].get('sha256') for a,b in zip(success,success[1:]))
    print('\n'+name+':',len(success),'successful /',len(records),'attempts; payload changes:',changes)
    if success:
        t,r=success[-1]; print('  latest:',t,{k:r[k] for k in ('game_status','period','clock','away','home','actions','stints','competitors','rows','plays') if k in r})
    for error,count in errors.most_common(3): print('  error:',count,error[:180])
print('\nScore comparisons (different providers may publish at different times):')
disagreements=0
for sample in samples:
    results={x['source']:x for x in sample['results']}
    a=results.get('trail_game',{}); b=results.get('espn_scoreboard',{})
    competitors={x['side']:x.get('score') for x in b.get('competitors',[])}
    if a.get('error') or b.get('error') or a.get('home') is None or not competitors: continue
    if str(a['home'])!=str(competitors.get('home')) or str(a['away'])!=str(competitors.get('away')):
        disagreements+=1; print(' ',sample['sampled_at'],'Trailblaze away/home',a['away'],a['home'],'ESPN away/home',competitors.get('away'),competitors.get('home'))
print('Disagreement samples:',disagreements)
print('A matching snapshot does not establish identical event timing or independent upstream sources.')
