import json,sys,collections,os
sys.path.insert(0,os.path.dirname(__file__)); import rows as sbx
# compare.py <engine report.json> <spotbugs.xml> <patterns,comma> [sources.txt] [-v] [-n N] : same / missed / extra by pattern, file, line, message
args=[a for a in sys.argv[1:] if not a.startswith('-')]; verbose='-v' in sys.argv
limit=int(sys.argv[sys.argv.index('-n')+1]) if '-n' in sys.argv else 12
if '-n' in sys.argv: args.remove(str(limit))
pats=args[2].split(',')
eng=json.load(open(args[0])); files=sorted({f['file'] for f in eng['findings']})
E=collections.Counter(); P=collections.Counter()
for f in eng['findings']:
    if f['rule'] in pats: E[(f['rule'],f['file'],f['line'],f['message'])]+=1
bypath=collections.defaultdict(list)
for line in open(args[3]) if len(args)>3 else []: bypath[line.strip().split('/')[-1]].append(line.strip())
def locate(path):
    c=[x for x in bypath.get(path.split('/')[-1],[]) if x.endswith('/'+path)]
    return c[0] if len(c)==1 else path
for r in sbx.rows(args[1]):
    if r['pattern'] in pats: P[(r['pattern'],locate(r['path']),r['line'],r['message'])]+=1
tot=[0,0,0]
for c in pats:
    e={k:v for k,v in E.items() if k[0]==c}; p={k:v for k,v in P.items() if k[0]==c}
    same=sum(min(v,e.get(k,0)) for k,v in p.items()); missed=sum(v-min(v,e.get(k,0)) for k,v in p.items()); extra=sum(v-min(v,p.get(k,0)) for k,v in e.items())
    tot[0]+=same;tot[1]+=missed;tot[2]+=extra
    print(f'{c}: same {same} missed {missed} extra {extra}')
    if verbose:
        for k in sorted(k for k in p if k not in e)[:limit]: print('  missed',k[1].split('/')[-1],k[2],k[3][:150])
        for k in sorted(k for k in e if k not in p)[:limit]: print('  extra ',k[1].split('/')[-1],k[2],k[3][:150])
print('TOTAL same %d missed %d extra %d'%tuple(tot))
