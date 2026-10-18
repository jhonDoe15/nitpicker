import { MESSAGES } from '../../../shared/policy.mjs';
import { repeatsInSource } from '../../../shared/rules/finding-helpers.mjs';
import {
  descriptorTypes,
  sameConstructor,
  simpleClassName,
} from './constructors/constructor-match.mjs';
import { childrenNamed, parseXml } from '../../../shared/ingest/common.mjs';
import { ingestCrapRows } from '../../../shared/ingest/lizard-crap.mjs';
import { jacocoLineUnits } from './coverage-reports/jacoco-lines.mjs';
import { coverageLookup, ownRange } from './units/unit-coverage.mjs';

const LAMBDA_METHOD_PREFIX = 'lambda$';

export function ingestCrap(structure, jacocoXml, options = {}) {
  return ingestCrapFunctions(structureFunctions(structure), jacocoXml, {
    unknownMessage: MESSAGES.crapCoverageUnknownJava,
    ...options,
  });
}

export function ingestCrapFunctions(parsed, jacocoXml, options = {}) {
  const report = parseJacocoReport(jacocoXml);
  const coverageOf = coverageLookup({
    pools: {
      methods: jacocoMethods(report),
      lines: parsed.some((fn) => fn.lineScoped || fn.lineFallback)
        ? jacocoLineUnits(report)
        : new Map(),
    },
    keysOf: options.jacocoKeys ?? rootRelativeKeys(options.sourceRoots ?? ['']),
    selectMethods: options.selectMethods ?? selectJavaMethods,
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
        parameterTypes: entry.parameterTypes,
        start: entry.start,
        end: entry.end,
        lambda: entry.lambda === true,
        lineScoped: entry.initializer === true,
        numberedAmongSameSource: repeatsInSource(entry.name),
      };
    });
}

function parseJacocoReport(xml) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  return report;
}

function jacocoMethods(report) {
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

function selectJavaMethods(fn, candidates, siblings) {
  if (fn.lineScoped) {
    return ownRange(fn, candidates, siblings);
  }
  return fn.lambda
    ? ownRange(fn, candidates.filter(isLambdaMethod), siblings)
    : selectNamedMethods(fn, candidates);
}

function isLambdaMethod(method) {
  return method.name.startsWith(LAMBDA_METHOD_PREFIX);
}

function selectNamedMethods(fn, candidates) {
  return candidates.filter(
    (method) =>
      method.name === fn.name &&
      ((method.line >= fn.start && method.line <= fn.end) || sameConstructor(method, fn)),
  );
}

function rootRelativeKeys(sourceRoots) {
  return (filePath) =>
    sourceRoots.flatMap((root) => {
      const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
      return filePath.startsWith(prefix) ? [filePath.slice(prefix.length)] : [];
    });
}

function jacocoMethod(method, cls) {
  const line = Number.parseInt(method.attrs.line, 10);
  if (!Number.isInteger(line)) {
    return [];
  }
  const constructor = method.attrs.name === '<init>';
  return [
    {
      name: constructor ? simpleClassName(cls.attrs.name ?? '') : method.attrs.name,
      constructorTypes: constructor ? descriptorTypes(method.attrs.desc) : undefined,
      className: cls.attrs.name ?? '',
      line,
      lines: counter(method, 'LINE'),
      branches: counter(method, 'BRANCH'),
    },
  ];
}

function addClassMethods({ pkg, cls }, byFile) {
  const file = [pkg.attrs.name, cls.attrs.sourcefilename].filter(Boolean).join('/');
  const methods = childrenNamed(cls, 'method').flatMap((method) => jacocoMethod(method, cls));
  if (methods.length > 0) {
    byFile.set(file, [...(byFile.get(file) ?? []), ...methods]);
  }
}
