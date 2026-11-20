import json,sys,collections
# compare.py <engine report.json> <ep.json> [check] [-v] : same / missed / extra per check, by file, line, column, message
args=[a for a in sys.argv[1:] if a!='-v']; verbose='-v' in sys.argv
eng=json.load(open(args[0])); ep=json.load(open(args[1])); only=args[2] if len(args)>2 else None
E=collections.Counter((f['rule'],f['file'],f['line'],f['column'],f['message'].split('\n')[0]) for f in eng['findings'] if not only or f['rule']==only)
checks={k[0] for k in E}|({only} if only else set(json.load(open(__file__.rsplit('/',1)[0]+'/ported.json'))))
P=collections.Counter((f['check'],f['file'],f['line'],f['col'],f['message']) for f in ep['findings'] if f['check'] in checks)
tot=[0,0,0]
for c in sorted(checks):
    e={k:v for k,v in E.items() if k[0]==c}; p={k:v for k,v in P.items() if k[0]==c}
    same=sum(min(v,e.get(k,0)) for k,v in p.items()); missed=sum(v-min(v,e.get(k,0)) for k,v in p.items()); extra=sum(v-min(v,p.get(k,0)) for k,v in e.items())
    tot[0]+=same;tot[1]+=missed;tot[2]+=extra
    print(f'{c}: same {same} missed {missed} extra {extra}')
    if only or verbose:
        for k in sorted(k for k in p if k not in e)[:12]: print('  missed',k[1].split('/')[-1],k[2],k[3],k[4][:170])
        for k in sorted(k for k in e if k not in p)[:12]: print('  extra ',k[1].split('/')[-1],k[2],k[3],k[4][:170])
print('TOTAL same %d missed %d extra %d'%tuple(tot))
