import xml.etree.ElementTree as ET,sys,json
# rows.py <spotbugs.xml> [pattern,...] [--json prefix] : one row per SpotBugs finding: pattern, source path, primary line, long message
def rows(path):
    out=[]
    for b in ET.parse(path).getroot().findall('BugInstance'):
        src=next((s for s in b.findall('SourceLine') if s.get('role')!='SOURCE_UNREACHABLE_CODE'),None)
        if src is None:
            for tag in ('Method','Field','Class'):
                e=b.find(tag)
                if e is not None and e.find('SourceLine') is not None: src=e.find('SourceLine'); break
        out.append({'pattern':b.get('type'),'path':src.get('sourcepath') if src is not None else '?','line':int(src.get('start') or 0) if src is not None else 0,
                    'message':b.findtext('LongMessage'),'priority':b.get('priority')})
    return out
if __name__=='__main__':
    args=[a for a in sys.argv[1:] if a!='--json']; only=args[1].split(',') if len(args)>1 and args[1] else None
    found=sorted((r for r in rows(args[0]) if not only or r['pattern'] in only),key=lambda r:(r['path'],r['line'],r['pattern']))
    if '--json' in sys.argv:
        prefix=args[2] if len(args)>2 else ''
        print('[\n'+',\n'.join(json.dumps([prefix+r['path'],r['pattern'],r['line'],r['message']]) for r in found)+'\n]')
    else:
        for r in found: print(r['pattern'],r['path'],r['line'],r['priority'],r['message'],sep='\t')
