import { MESSAGES } from '../../../shared/policy.mjs';
import {
  descriptorTypes,
  sameConstructor,
  simpleClassName,
} from './constructors/constructor-match.mjs';
import { childrenNamed, parseXml } from '../../../shared/ingest/common.mjs';
import { ingestCrapRows } from '../../../shared/ingest/lizard-crap.mjs';
import { jacocoLineUnits } from './coverage-reports/jacoco-lines.mjs';

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
      lines: parsed.some((fn) => fn.lineScoped) ? jacocoLineUnits(report) : new Map(),
    },
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
        parameterTypes: entry.parameterTypes,
        start: entry.start,
        end: entry.end,
      };
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
