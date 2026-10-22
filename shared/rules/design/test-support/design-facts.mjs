import { sharedFactFindings } from '../../facts/evaluate.mjs';

export function owner(file, name, extra = {}) {
  return {
    id: name === undefined ? file : `${file}#${name}`,
    file,
    name:
      name ??
      file
        .split('/')
        .at(-1)
        .replace(/\.\w+$/u, ''),
    line: 1,
    kind: name === undefined ? 'module' : 'class',
    exported: true,
    ...extra,
  };
}

export function fn(owned, name, extra = {}) {
  const ownerId = owned.kind === 'module' ? owned.file : owned.id;
  return {
    id: `${ownerId}${owned.kind === 'module' ? '#' : '.'}${name}`,
    file: owned.file,
    name,
    line: 2,
    kind: owned.kind === 'module' ? 'function' : 'method',
    owner: ownerId,
    exported: true,
    ...extra,
  };
}

export function designFacts({ types = [], callables = [], tests = [], packages = [] }) {
  const files = [...new Set([...types, ...callables].map(({ file }) => file))].sort();
  return {
    modules: files.map((file) => ({ file, role: tests.includes(file) ? 'test' : 'production' })),
    packages,
    types,
    callables,
  };
}

export function designRun(facts, rule, policy = {}) {
  return sharedFactFindings(facts, {
    language: 'typescript',
    analyzerName: 'structure',
    policy,
    rules: [rule],
  });
}

export function summaries(findings) {
  return findings.map(({ rule, path, identity, classification, location }) => ({
    rule,
    path,
    identity,
    classification,
    line: location?.line,
  }));
}
