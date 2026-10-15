import { childrenNamed, parseXml } from '../../../shared/ingest/common.mjs';
import { ingestCrapRows } from '../../../shared/ingest/lizard-crap.mjs';

export function ingestCrap(structure, jacocoXml, options = {}) {
  return ingestCrapFunctions(structureFunctions(structure), jacocoXml, options);
}

export function ingestCrapFunctions(parsed, jacocoXml, options = {}) {
  const coverageOf = coverageLookup({
    methods: jacocoMethods(jacocoXml),
    keysOf: options.jacocoKeys ?? rootRelativeKeys(options.sourceRoots ?? ['']),
    selectMethods: options.selectMethods ?? selectNamedMethods,
    parsed,
  });
  return ingestCrapRows(parsed, options, (fn, filePath) => ({
    coverage: coverageOf(fn, filePath),
  }));
}

function structureFunctions(entries) {
  return entries
    .filter((entry) => entry.privateEmptyConstructor !== true)
    .map((entry) => {
      if (!Number.isInteger(entry.complexity)) {
        throw new TypeError(`Structure entry without complexity: ${entry.name}`);
      }
      if (typeof entry.signature !== 'string') {
        throw new TypeError(`Structure entry without signature: ${entry.name}`);
      }
      return {
        ccn: entry.complexity,
        file: entry.file,
        name: entry.name.split('.').at(-1),
        longName: entry.signature,
        start: entry.start,
        end: entry.end,
      };
    });
}

function jacocoMethods(xml) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const byFile = new Map();
  const classes = childrenNamed(report, 'package').flatMap((pkg) =>
    childrenNamed(pkg, 'class').map((cls) => ({ pkg, cls })),
  );
  for (const entry of classes) addClassMethods(entry, byFile);
  return byFile;
}

function counter(element, type) {
  const found = childrenNamed(element, 'counter').find(
    (candidate) => candidate.attrs.type === type,
  );
  if (found === undefined) {
    return { covered: 0, total: 0 };
  }
  const covered = Number.parseInt(found.attrs.covered, 10);
  return { covered, total: covered + Number.parseInt(found.attrs.missed, 10) };
}

function selectNamedMethods(fn, candidates) {
  return candidates.filter(
    (method) => method.name === fn.name && method.line >= fn.start && method.line <= fn.end,
  );
}

function rootRelativeKeys(sourceRoots) {
  return (filePath) =>
    sourceRoots.flatMap((root) => {
      const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
      return filePath.startsWith(prefix) ? [filePath.slice(prefix.length)] : [];
    });
}

function coverageLookup({ methods, keysOf, selectMethods, parsed }) {
  const siblings = Map.groupBy(parsed, (fn) => fn.file);

  function coverageOf(fn, filePath) {
    const matches = keysOf(filePath).flatMap((key) =>
      selectMethods(fn, methods.get(key) ?? [], siblings.get(fn.file)),
    );
    return lowestCoverage(matches);
  }

  return coverageOf;
}

function lowestCoverage(matches) {
  function sum(key) {
    return {
      covered: matches.reduce((total, method) => total + method[key].covered, 0),
      total: matches.reduce((total, method) => total + method[key].total, 0),
    };
  }
  const percents = [sum('lines'), sum('branches')]
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : Math.min(...percents);
}

function addClassMethods({ pkg, cls }, byFile) {
  const file = [pkg.attrs.name, cls.attrs.sourcefilename].filter(Boolean).join('/');
  const simpleName = (cls.attrs.name ?? '')
    .split('/')
    .at(-1)
    .split('$')
    .at(-1)
    .replace(/^\d+/u, '');
  const methods = childrenNamed(cls, 'method')
    .map((method) => ({ method, line: Number.parseInt(method.attrs.line, 10) }))
    .filter(({ line }) => Number.isInteger(line));
  for (const { method, line } of methods) {
    byFile.set(file, [
      ...(byFile.get(file) ?? []),
      {
        name: method.attrs.name === '<init>' ? simpleName : method.attrs.name,
        className: cls.attrs.name ?? '',
        line,
        lines: counter(method, 'LINE'),
        branches: counter(method, 'BRANCH'),
      },
    ]);
  }
}
