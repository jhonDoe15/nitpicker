import json, sys, collections
ref = json.load(open(sys.argv[1])); got = json.load(open(sys.argv[2]))
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 15
print('summary ref', ref['summary'], 'got', got['summary'])
for key, name in (('functions', 'function'), ('classes', 'class')):
    by = lambda rows: collections.defaultdict(list, {})
    a = collections.defaultdict(list); b = collections.defaultdict(list)
    for row in ref[key]: a[row['source']].append(row)
    for row in got[key]: b[row['source']].append(row)
    same = 0; bad_files = []
    for source in sorted(set(a) | set(b)):
        if a[source] == b[source]: same += len(a[source])
        else: bad_files.append(source)
    total = len(ref[key])
    print(f'{key}: {same} of {total} identical in order; {len(bad_files)} files differ')
    shown = 0
    for source in bad_files:
        ra = [json.dumps(r, sort_keys=True) for r in a[source]]; rb = [json.dumps(r, sort_keys=True) for r in b[source]]
        only_a = [r for r in ra if r not in rb]; only_b = [r for r in rb if r not in ra]
        if not only_a and not only_b:
            print('  ORDER', source); shown += 1
        for r in only_a[:2]: print('  ref', r)
        for r in only_b[:2]: print('  got', r)
        shown += 1
        if shown >= limit: break
ua = {u['file'] for u in ref['unparsed']}; ub = {u['file'] for u in got['unparsed']}
print('unparsed ref', len(ua), 'got', len(ub), 'only ref', sorted(ua - ub)[:5], 'only got', sorted(ub - ua)[:5])
