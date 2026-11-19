import { MESSAGES } from '../../../shared/policy.mjs';
import { repeatsInSource as untypedRepeatsInSource } from '../../../shared/rules/finding-helpers.mjs';
import {
  descriptorTypes,
  sameConstructor,
  simpleClassName,
} from './constructors/constructor-match.mts';
import { ingestCrapRows } from '../../../shared/ingest/lizard-crap.mjs';
import {
  fieldOf,
  listOf,
  numberOr,
  optionalText,
  textOf,
} from '../../../shared/values/readers.mts';
import { childrenNamed, parseXml } from '../../../shared/values/xml.mts';
import type { XmlElement } from '../../../shared/values/xml.mts';
import type { JavaFinding } from '../adapters/typed/java-values.mts';
import { jacocoLineUnits, joinedPath } from './coverage-reports/jacoco-lines.mts';
import { coverageLookup, ownRange } from './units/unit-coverage.mts';
import type { Counts, CoverageUnit, FunctionUnit, SelectMethods } from './units/unit-types.mts';

type SourceEntry = { readonly file: string; readonly start: number; readonly end: number };
export type CrapOptions = {
  readonly sourceRoots?: readonly string[] | undefined;
  readonly jacocoKeys?: ((filePath: string) => readonly string[]) | undefined;
  readonly selectMethods?: SelectMethods | undefined;
  readonly unknownMessage?: string | undefined;
  readonly tool?: string | undefined;
  readonly limit?: number | undefined;
  readonly root?: string | undefined;
  readonly sourceText?: ((entry: SourceEntry) => string | undefined) | undefined;
};
type CrapResult = { findings: JavaFinding[] };

const crapRows: (
  parsed: readonly FunctionUnit[],
  options: CrapOptions,
  resolve: (fn: FunctionUnit, filePath: string) => { readonly coverage: number | undefined },
) => CrapResult = ingestCrapRows;
const repeatsInSource: (name: string) => boolean = untypedRepeatsInSource;
const unknownMessage: string = MESSAGES.crapCoverageUnknownJava;

const LAMBDA_METHOD_PREFIX = 'lambda$';

export function ingestCrap(
  structure: unknown,
  jacocoXml: string,
  options: CrapOptions = {},
): CrapResult {
  return ingestCrapFunctions(structureFunctions(structure), jacocoXml, {
    unknownMessage,
    ...options,
  });
}

export function ingestCrapFunctions(
  parsed: readonly FunctionUnit[],
  jacocoXml: string,
  options: CrapOptions = {},
): CrapResult {
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
  return crapRows(parsed, options, (fn, filePath) => ({
    coverage: coverageOf(fn, filePath),
  }));
}

function structureFunctions(structure: unknown): FunctionUnit[] {
  return listOf(structure)
    .filter((entry) => fieldOf(entry, 'privateEmptyConstructor') !== true)
    .map((entry): FunctionUnit => {
      const name = textOf(fieldOf(entry, 'name'));
      const complexity = fieldOf(entry, 'complexity');
      if (typeof complexity !== 'number' || !Number.isInteger(complexity)) {
        throw new TypeError(`Structure entry without complexity: ${name}`);
      }
      const signature = optionalText(fieldOf(entry, 'signature'));
      if (signature === undefined) {
        throw new TypeError(`Structure entry without signature: ${name}`);
      }
      return {
        ccn: complexity,
        file: textOf(fieldOf(entry, 'file')),
        name: name.split('.').at(-1) ?? name,
        longName: signature,
        signature,
        parameterTypes: fieldOf(entry, 'parameterTypes'),
        start: numberOr(fieldOf(entry, 'start'), Number.NaN),
        end: numberOr(fieldOf(entry, 'end'), Number.NaN),
        lambda: fieldOf(entry, 'lambda') === true,
        lineScoped: fieldOf(entry, 'initializer') === true,
        lineFallback: false,
        numberedAmongSameSource: repeatsInSource(name),
      };
    });
}

function parseJacocoReport(xml: string): XmlElement {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  return report;
}

function jacocoMethods(report: XmlElement): Map<string, CoverageUnit[]> {
  const byFile = new Map<string, CoverageUnit[]>();
  const classes = childrenNamed(report, 'package').flatMap((pkg) =>
    childrenNamed(pkg, 'class').map((cls) => ({ pkg, cls })),
  );
  for (const entry of classes) {
    addClassMethods(entry, byFile);
  }
  return byFile;
}

function counter(element: XmlElement, type: string): Counts {
  const found = childrenNamed(element, 'counter').find(
    (candidate) => candidate.attrs['type'] === type,
  );
  if (found === undefined) {
    return { covered: 0, total: 0 };
  }
  const covered = Number.parseInt(found.attrs['covered'] ?? '', 10);
  return { covered, total: covered + Number.parseInt(found.attrs['missed'] ?? '', 10) };
}

function selectJavaMethods(
  fn: FunctionUnit,
  candidates: readonly CoverageUnit[],
  siblings: readonly FunctionUnit[],
): CoverageUnit[] {
  if (fn.lineScoped) {
    return ownRange(fn, candidates, siblings);
  }
  return fn.lambda
    ? ownRange(fn, candidates.filter(isLambdaMethod), siblings)
    : selectNamedMethods(fn, candidates);
}

function isLambdaMethod(method: CoverageUnit): boolean {
  return method.name.startsWith(LAMBDA_METHOD_PREFIX);
}

function selectNamedMethods(fn: FunctionUnit, candidates: readonly CoverageUnit[]): CoverageUnit[] {
  return candidates.filter(
    (method) =>
      method.name === fn.name &&
      ((method.line >= fn.start && method.line <= fn.end) || sameConstructor(method, fn)),
  );
}

function rootRelativeKeys(sourceRoots: readonly string[]): (filePath: string) => string[] {
  return (filePath) =>
    sourceRoots.flatMap((root) => {
      const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
      return filePath.startsWith(prefix) ? [filePath.slice(prefix.length)] : [];
    });
}

function jacocoMethod(method: XmlElement, cls: XmlElement): CoverageUnit[] {
  const line = Number.parseInt(method.attrs['line'] ?? '', 10);
  if (!Number.isInteger(line)) {
    return [];
  }
  const constructor = method.attrs['name'] === '<init>';
  return [
    {
      name: constructor ? simpleClassName(cls.attrs['name'] ?? '') : (method.attrs['name'] ?? ''),
      constructorTypes: constructor ? descriptorTypes(method.attrs['desc']) : undefined,
      className: cls.attrs['name'] ?? '',
      line,
      lines: counter(method, 'LINE'),
      branches: counter(method, 'BRANCH'),
    },
  ];
}

function addClassMethods(
  { pkg, cls }: { pkg: XmlElement; cls: XmlElement },
  byFile: Map<string, CoverageUnit[]>,
): void {
  const file = joinedPath(pkg.attrs['name'], cls.attrs['sourcefilename']);
  const methods = childrenNamed(cls, 'method').flatMap((method) => jacocoMethod(method, cls));
  if (methods.length > 0) {
    byFile.set(file, [...(byFile.get(file) ?? []), ...methods]);
  }
}
