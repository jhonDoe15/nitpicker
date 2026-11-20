#!/usr/bin/env python3
# compare.py <engine report.json> <classes dir> [-v] [-n N] : the names `--rules _JavacNames` gives against the
# names javac wrote into the class files, for anonymous classes, local classes and lambdas.
import collections, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import names

args = [a for a in sys.argv[1:] if not a.startswith('-')]
verbose = '-v' in sys.argv
limit = int(sys.argv[sys.argv.index('-n') + 1]) if '-n' in sys.argv else 15
if '-n' in sys.argv:
    args.remove(str(limit))
engine = collections.defaultdict(list)
for f in json.load(open(args[0]))['findings']:
    engine[f['rule']].append((f['message'], f['line'], f['column'], os.path.basename(f['file'])))
javac = names.rows(args[1])
HASHED = re.compile(r'^lambda\$.*\$[0-9a-f]{1,8}\$\d+$')
counts = collections.Counter()
shown = collections.defaultdict(list)

def take(rule, message, first, last):
    found = [row for row in engine[rule] if row[0] == message]
    inside = [row for row in found if first == 0 or row[1] <= first and last <= row[2]]
    for row in inside[:1] or found[:1]:
        engine[rule].remove(row)
        return 'same' if inside else 'line'
    return None

for row in javac:
    if row[0] == 'C':
        _, name, source, first, last, constructor = row
        local = not name.rsplit('$', 1)[-1].isdigit()
        kind = 'local class' if local else 'anonymous class'
        result = take('local', name, first, last) if local else take('class', f"{name}({','.join(constructor)})", first, last)
        label = name if local else f"{name}({','.join(constructor)})"
    else:
        _, owner, method, parameters, first, last = row
        label = f"{owner}.{method}({','.join(parameters)})"
        if HASHED.match(method) and not re.match(r'^lambda\$.*\$\d+$', method.rsplit('$', 2)[0] + '$0x'):
            kind = 'serializable lambda'
            found = [r for r in engine['serializable'] if r[0] == owner]
            if found:
                engine['serializable'].remove(found[0])
            result = 'same' if found else None
        else:
            kind = 'lambda'
            result = take('lambda', label, first, last)
            if result is None:
                kind = 'method reference'
                result = take('reference', f"{owner}.{method}", 0, 0)
                kind = 'method reference' if result else 'lambda'
    counts[(kind, result or 'missed')] += 1
    if result != 'same':
        shown[kind].append(f"  {result or 'missed'} {label} lines {first}-{last}")
for rule, left in engine.items():
    kind = {'class': 'anonymous class', 'local': 'local class', 'lambda': 'lambda', 'reference': 'method reference', 'serializable': 'serializable lambda'}[rule]
    counts[(kind, 'extra')] += len(left)
    shown[kind] += [f"  extra {message} {source} lines {line}-{last}" for message, line, last, source in left]
total = collections.Counter()
for kind in ['anonymous class', 'local class', 'lambda', 'method reference', 'serializable lambda']:
    row = {result: counts[(kind, result)] for result in ['same', 'line', 'missed', 'extra']}
    total.update(row)
    print(f"{kind}: same {row['same']} other line {row['line']} missed {row['missed']} extra {row['extra']}")
    if verbose:
        print('\n'.join(sorted(shown[kind])[:limit]))
print(f"TOTAL same {total['same']} other line {total['line']} missed {total['missed']} extra {total['extra']}")
