#!/usr/bin/env python3
"""Compares two CPD XML reports: files with their token counts, and every duplication with its marks."""
import sys, xml.etree.ElementTree as ET
NS='{https://pmd-code.org/schema/cpd-report}'
def load(p):
    r=ET.parse(p).getroot()
    files=[(f.get('path'),f.get('totalNumberOfTokens')) for f in r.findall(NS+'file')]
    dups=[]
    for d in r.findall(NS+'duplication'):
        marks=tuple((f.get('path'),f.get('line'),f.get('endline'),f.get('column'),f.get('endcolumn'),f.get('begintoken'),f.get('endtoken')) for f in d.findall(NS+'file'))
        dups.append((d.get('lines'),d.get('tokens'),marks))
    errs=[(e.get('filename'),e.get('msg')) for e in r.findall(NS+'error')]
    return files,dups,errs
a=load(sys.argv[1]); b=load(sys.argv[2])
print('files', len(a[0]), len(b[0]), 'same' if a[0]==b[0] else 'DIFF')
print('dups', len(a[1]), len(b[1]), 'same' if a[1]==b[1] else 'DIFF', 'errors', len(a[2]))
if a[1]!=b[1]:
    for i,(x,y) in enumerate(zip(a[1],b[1])):
        if x!=y: print(i, x, '\n  ', y); break
    sa=set(a[1]); sb=set(b[1]); print('only pmd',len(sa-sb),'only engine',len(sb-sa))
sys.exit(0 if a==b or (a[0]==b[0] and a[1]==b[1] and not a[2]) else 1)
