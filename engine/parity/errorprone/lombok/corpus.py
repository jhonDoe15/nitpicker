import collections
import json
import os
import shutil
import sys


def directives(text):
    found = []
    for line in text.split('\n'):
        if not line:
            continue
        if not line.startswith('//'):
            break
        found.append(line[2:].strip())
    return found


def runs_here(found):
    for directive in found:
        lower = directive.lower()
        if lower == 'ignore' or lower.startswith('ignore '):
            return 'ignored by Lombok'
        if lower.startswith('platform '):
            names = [n.strip() for n in lower[9:].split(':')[0].split(',')]
            if any(not n.startswith('!') for n in names) and 'javac' not in names:
                return 'not for javac'
            if '!javac' in names:
                return 'not for javac'
    return None


def prepare(source_root, work, classpath):
    before = os.path.join(source_root, 'test/transform/resource/before')
    skipped = {}
    for name in sorted(os.listdir(before)):
        if not name.endswith('.java'):
            continue
        text = open(os.path.join(before, name), encoding='utf-8').read()
        found = directives(text)
        reason = runs_here(found)
        if reason:
            skipped[name] = reason
            continue
        folder = os.path.join(work, name[:-5])
        os.makedirs(folder, exist_ok=True)
        shutil.copy(os.path.join(before, name), folder)
        conf = [d[5:].strip() for d in found if d.lower().startswith('conf:')]
        with open(os.path.join(folder, 'lombok.config'), 'w') as out:
            out.write('\n'.join(['config.stopBubbling = true'] + conf) + '\n')
        with open(os.path.join(folder, 'sources.txt'), 'w') as out:
            out.write(os.path.join(folder, name) + '\n')
        with open(os.path.join(folder, 'cp.txt'), 'w') as out:
            out.write('\n'.join(classpath) + '\n')
    json.dump(skipped, open(os.path.join(work, 'skipped.json'), 'w'), indent=1)
    print('prepared', len(os.listdir(work)) - 1, 'skipped', len(skipped))


def suggestion(message):
    at = message.find('\n  Did you mean ')
    return message[at + 3:] if at >= 0 else ''


def compare(work, checks):
    status = collections.Counter()
    same = collections.Counter()
    differ = collections.defaultdict(collections.Counter)
    files = collections.defaultdict(set)
    rows = {}
    for name in sorted(os.listdir(work)):
        folder = os.path.join(work, name)
        if not os.path.isdir(folder):
            continue
        ep_path, engine_path = os.path.join(folder, 'ep.json'), os.path.join(folder, 'engine.json')
        if not os.path.exists(ep_path) or not json.load(open(ep_path))['ok']:
            status['does not compile alone'] += 1
            continue
        ep = json.load(open(ep_path))
        if os.path.exists(os.path.join(folder, 'crashed.txt')):
            status['Error Prone crashed (check switched off, run again)'] += 1
        engine = json.load(open(engine_path)) if os.path.exists(engine_path) else None
        if engine is None or engine.get('syntaxErrorFiles'):
            status['engine could not parse'] += 1
            continue
        status['compared'] += 1
        key = lambda f: (f['check'], f['line'], f['col'], f['message'], f.get('suggest', ''))
        theirs = collections.Counter(key(f) for f in ep['findings'] if f['check'] in checks)
        generated = collections.Counter(key(f) for f in ep['findings'] if f['check'] in checks and f.get('generated'))
        shared = collections.Counter(key(f) for f in ep['findings'] if f['check'] in checks and f.get('shared'))
        places = {k[1:3] for k in generated}
        ours = collections.Counter((f['rule'], f['line'], f['column'], f['message'].split('\n')[0],
                                    suggestion(f['message'])) for f in engine['findings'] if f['rule'] in checks)
        rows[name] = sorted('%s:%d:%d %s %s' % k for k in theirs.elements())
        inside = lambda counter: collections.Counter({k: v for k, v in counter.items() if k[1:3] in places})
        if inside(ours):
            status['engine reports inside generated code'] += 1
        theirs, ours = theirs - generated, ours - inside(ours)
        for found, count in generated.items():
            differ[found[0]]['generated'] += count
        for found, count in (shared - ours).items():
            differ[found[0]]['shared'] += count
        same['same'] += sum((theirs & ours).values())
        missed, extra = theirs - ours, ours - theirs
        place = lambda counter: collections.Counter(k[:4] for k in counter.elements())
        sentence = place(missed) & place(extra)
        for kind, counter in (('missed', place(missed) - sentence), ('extra', place(extra) - sentence),
                              ('sentence', sentence)):
            for key, count in counter.items():
                differ[key[0]][kind] += count
                files[key[0]].add(name)
        if not missed and not extra:
            status['identical'] += 1
    return status, same, differ, files, rows


def table(work, checks):
    status, same, differ, files, rows = compare(work, checks)
    lines = ['| Files | Count |', '| --- | ---: |']
    lines += ['| %s | %d |' % item for item in sorted(status.items())]
    total = lambda kind: sum(c[kind] for c in differ.values())
    lines += ['', 'Findings: %d the same, %d only from Error Prone, %d only from the engine, %d with another sentence; '
              '%d Error Prone findings inside Lombok-generated code (dropped, not compared). Of the findings only from '
              'Error Prone, %d sit where generated and written code share a position (a class annotation at the start '
              'of a file without a package statement).'
              % (same['same'], total('missed'), total('extra'), total('sentence'), total('generated'), total('shared')),
              '', '| Check | Only Error Prone | Only engine | Other sentence | Files | Inside generated code | Shared |',
              '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    order = sorted(differ, key=lambda c: (-sum(differ[c].values()), c))
    lines += ['| `%s` | %d | %d | %d | %d | %d | %d |' % (c, differ[c]['missed'], differ[c]['extra'], differ[c]['sentence'],
                                                          len(files[c]), differ[c]['generated'], differ[c]['shared'])
              for c in order]
    json.dump(rows, open(os.path.join(work, 'rows.json'), 'w'), indent=0, sort_keys=True)
    json.dump({c: sorted(files[c]) for c in order}, open(os.path.join(work, 'files-by-check.json'), 'w'), indent=1)
    return '\n'.join(lines)


def versions(root, names):
    rows = {v: json.load(open(os.path.join(root, v, 'rows.json'))) for v in names}
    groups = collections.OrderedDict()
    for v in names:
        key = json.dumps({k: r for k, r in rows[v].items() if all(k in rows[o] for o in names)}, sort_keys=True)
        groups.setdefault(key, []).append(v)
    lines = ['| Lombok versions with the same Error Prone rows (files compared in all) |', '| --- |']
    return '\n'.join(lines + ['| %s |' % ', '.join(g) for g in groups.values()])


def expected(ep_report, root, out):
    findings = json.load(open(ep_report))['findings']
    row = lambda f: [os.path.relpath(f['file'], root), f['check'], f['line'], f['col']]
    for name, keep in (('', lambda f: not f.get('generated')), ('-generated', lambda f: f.get('generated'))):
        rows = sorted(row(f) for f in findings if f['check'] != '_error' and keep(f))
        with open(out + name + '.json', 'w') as written:
            written.write('[\n' + ',\n'.join(json.dumps(r) for r in rows) + '\n]\n')


def main():
    command = sys.argv[1]
    if command == 'expected':
        expected(sys.argv[2], sys.argv[3], sys.argv[4])
    elif command == 'prepare':
        prepare(sys.argv[2], sys.argv[3], [p for p in sys.argv[4].split(':') if p])
    elif command == 'table':
        checks = set(json.load(open(sys.argv[3]))) - {'NullAway'}
        print(table(sys.argv[2], checks))
    elif command == 'versions':
        print(versions(sys.argv[2], sys.argv[3:]))


if __name__ == '__main__':
    main()
