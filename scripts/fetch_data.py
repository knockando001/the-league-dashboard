import json, urllib.request, datetime, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/'config.json').read_text())
BASE='https://api.sleeper.app/v1'; seed=str(cfg['leagueId']); max_week=int(cfg.get('maxWeek',18))
def get(path):
    with urllib.request.urlopen(BASE+path, timeout=30) as r:return json.load(r)
def points(m): return float(m.get('points',0) or 0)+float(m.get('custom_points',0) or 0)
leagues=[]; lid=seed
while lid:
    league=get('/league/'+lid); leagues.append(league); lid=league.get('previous_league_id')
all_games=[]; current_users={}; current_rosters=[]
for league in leagues:
    lid=league['league_id']; users=get('/league/'+lid+'/users'); rosters=get('/league/'+lid+'/rosters')
    um={u['user_id']:u for u in users}; rm={r['roster_id']:r for r in rosters}
    if lid==seed: current_users=um; current_rosters=rosters
    names={rid:(um.get(r.get('owner_id'),{}).get('metadata',{}).get('team_name') or um.get(r.get('owner_id'),{}).get('display_name') or f'Roster {rid}') for rid,r in rm.items()}
    for week in range(1,max_week+1):
        rows=get(f'/league/{lid}/matchups/{week}')
        groups={}
        for m in rows: groups.setdefault(m.get('matchup_id'),[]).append(m)
        for ms in groups.values():
            if len(ms)==2:
                a,b=ms; all_games.append({'season':league.get('season'),'week':week,'a':names[a['roster_id']],'b':names[b['roster_id']],'pa':points(a),'pb':points(b)})

def teamname(r):
    u=current_users.get(r.get('owner_id'),{}); return u.get('metadata',{}).get('team_name') or u.get('display_name') or f"Roster {r['roster_id']}"
standings=[]
for r in current_rosters:
    s=r.get('settings',{}); standings.append({'team':teamname(r),'wins':s.get('wins',0),'losses':s.get('losses',0),'ties':s.get('ties',0),'pointsFor':float(s.get('fpts',0) or 0)+float(s.get('fpts_decimal',0) or 0)/100})
standings.sort(key=lambda x:(-x['wins'],x['losses'],-x['pointsFor']))
agg={}
for g in all_games:
    key=tuple(sorted((g['a'],g['b']))); x=agg.setdefault(key,{'teamA':key[0],'teamB':key[1],'winsA':0,'winsB':0,'ties':0,'pointsA':0,'pointsB':0})
    if g['a']==x['teamA']: pa,pb=g['pa'],g['pb']
    else: pa,pb=g['pb'],g['pa']
    x['pointsA']+=pa;x['pointsB']+=pb
    if pa>pb:x['winsA']+=1
    elif pb>pa:x['winsB']+=1
    else:x['ties']+=1
records=[]
if all_games:
    best=max(all_games,key=lambda g:max(g['pa'],g['pb'])); team=best['a'] if best['pa']>=best['pb'] else best['b']; val=max(best['pa'],best['pb'])
    records.append({'label':'Highest team score','value':round(val,2),'detail':f"{team}, {best['season']} week {best['week']}"})
out={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'standings':standings,'records':records,'h2h':list(agg.values()),'leagueCount':len(leagues)}
(ROOT/'data/dashboard.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print('Wrote data/dashboard.json')