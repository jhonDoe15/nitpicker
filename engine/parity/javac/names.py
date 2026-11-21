#!/usr/bin/env python3
# names.py <classes dir> [-a] : what javac named things, read with javap. One row per anonymous or local class
# and per lambda method:
#   C <binary class> <source file> <first line> <last line> <constructor parameter types>
#   L <binary class> <method name> <parameter types> <first line> <last line>
# -a lists every method of every class as M rows too.
# names.py <classes dir> --json <prefix> : the same as rows for tests/expected/javac.json.
import subprocess, sys, os, re, json
def sig(desc):
    out=[]; i=1
    while desc[i] != ')':
        dims=0
        while desc[i]=='[': dims+=1; i+=1
        if desc[i]=='L':
            j=desc.index(';',i); name=desc[i+1:j].replace('/','.'); i=j+1
        else:
            name={'I':'int','J':'long','Z':'boolean','B':'byte','C':'char','S':'short','F':'float','D':'double'}[desc[i]]; i+=1
        out.append(name+'[]'*dims)
    return out
def classes(root):
    files=[]
    for d,_,fs in os.walk(root):
        files+=[os.path.join(d,f) for f in fs if f.endswith('.class')]
    files.sort(); res={}
    env={k:v for k,v in os.environ.items() if k not in('JAVA_TOOL_OPTIONS','_JAVA_OPTIONS')}
    for at in range(0,len(files),400):
        text=subprocess.run(['javap','-p','-l','-s']+files[at:at+400],capture_output=True,text=True,env=env).stdout
        cur=None; meth=None
        for line in text.split('\n'):
            m=re.match(r'Compiled from "(.*)"',line)
            if m: src=m.group(1); continue
            m=re.match(r'^(?:[a-z ]*?)(?:class|interface|enum|@interface) ([\w.$]+)',line)
            if m and not line.startswith(' '):
                cur={'name':m.group(1),'src':src,'methods':[],'interface':' interface ' in ' '+line}; res[cur['name']]=cur; meth=None; continue
            if line=='  static {};':
                meth={'name':'<clinit>','desc':'()V','lines':[]}; cur['methods'].append(meth); continue
            m=re.match(r'^  (?:.*[ .])?([\w$<>]+)\((.*)\)(?: throws .*)?;$',line)
            if m and cur is not None and not line.startswith('   '):
                meth={'name':m.group(1),'desc':None,'lines':[]}; cur['methods'].append(meth); continue
            m=re.match(r'^    descriptor: (\(.*)$',line)
            if m and meth is not None and meth['desc'] is None: meth['desc']=m.group(1); continue
            m=re.match(r'^      line (\d+): \d+',line)
            if m and meth is not None: meth['lines'].append(int(m.group(1)))
    return res
def rows(root, everything=False):
    out=[]
    for name,c in sorted(classes(root).items()):
        simple=name.rsplit('.',1)[-1]
        local=any(part[:1].isdigit() for part in simple.split('$')[1:])
        lines=[l for m in c['methods'] for l in m['lines']]
        if local and not c['interface'] and not any(m['name'].endswith(simple) for m in c['methods']):
            continue
        if local:
            ctor=[sig(m['desc']) for m in c['methods'] if m['desc'] and re.match(r'^[\w.$]+$',m['name']) and m['name'].endswith(simple)]
            out.append(['C',name,c['src'],min(lines,default=0),max(lines,default=0),ctor[0] if ctor else []])
        for m in c['methods']:
            if m['desc'] is None: continue
            if m['name']=='<clinit>': continue
            if m['name'].startswith('lambda$'):
                out.append(['L',name,m['name'],sig(m['desc']),min(m['lines'],default=0),max(m['lines'],default=0)])
            elif everything:
                out.append(['M',name,m['name'],sig(m['desc']),min(m['lines'],default=0),max(m['lines'],default=0)])
    return out
def expected(root, prefix):
    """Rows for tests/expected/javac.json: source file, kind, first and last line of its code, name."""
    out=[]
    for r in rows(root):
        if r[0]=='C':
            _,name,src,first,last,ctor=r
            anonymous=name.rsplit('$',1)[-1].isdigit()
            text=f"{name}({','.join(ctor)})" if anonymous else name
            kind='class' if anonymous else 'local'
        else:
            _,name,method,params,first,last=r
            src=None; kind='lambda'; text=f"{name}.{method}({','.join(params)})"
        package=name.rsplit('.',1)[0].replace('.','/')+'/' if '.' in name else ''
        top=name.rsplit('.',1)[-1].split('$')[0]
        out.append([prefix+package+(src or top+'.java'),kind,first,last,text])
    return sorted(out)
if __name__=='__main__':
    if '--json' in sys.argv:
        args=[a for a in sys.argv[1:] if a!='--json']
        print('[\n'+',\n'.join(json.dumps(r) for r in expected(args[0],args[1] if len(args)>1 else ''))+'\n]')
    else:
        for r in rows(sys.argv[1],'-a' in sys.argv): print(*[','.join(x) if isinstance(x,list) else x for x in r],sep='\t')
