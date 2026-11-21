import { sharedFactFindings } from '../../facts/evaluate.mts';
import { byText } from '../../../text-order/by-text.mts';
import type { Finding } from '../../../values/findings.mts';
import type { Facts, FactModule, FactPackage } from '../../facts/typed/fact-types.mts';
import type { DesignCallable, DesignType } from '../typed/design-types.mts';

type Fields = { readonly [field: string]: unknown };

export type DesignTestFacts = Facts & {
  readonly modules: readonly FactModule[];
  readonly types: readonly DesignType[];
  readonly callables: readonly DesignCallable[];
};

type DesignFactsInput = {
  readonly types?: readonly DesignType[];
  readonly callables?: readonly DesignCallable[];
  readonly tests?: readonly string[];
  readonly packages?: readonly FactPackage[];
};

export function owner(file: string, name?: string, extra: Fields = {}): DesignType {
  return {
    id: name === undefined ? file : `${file}#${name}`,
    file,
    name: name ?? (file.split('/').at(-1) ?? file).replace(/\.\w+$/u, ''),
    line: 1,
    kind: name === undefined ? 'module' : 'class',
    exported: true,
    ...extra,
  };
}

export function fn(
  owned: { readonly id: string; readonly file: string; readonly kind?: unknown },
  name: string,
  extra: Fields = {},
): DesignCallable & { readonly owner: string } {
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

export function designFacts({
  types = [],
  callables = [],
  tests = [],
  packages = [],
}: DesignFactsInput): DesignTestFacts {
  const files = [...new Set([...types, ...callables].map(({ file }) => file))].sort(byText);
  return {
    modules: files.map((file) => ({ file, role: tests.includes(file) ? 'test' : 'production' })),
    packages,
    types,
    callables,
  };
}

export function designRun(facts: Facts, rule: string, policy: object = {}): Finding[] {
  return sharedFactFindings(facts, {
    language: 'typescript',
    analyzerName: 'structure',
    policy,
    rules: [rule],
  });
}

export function summaries(findings: readonly Finding[]): object[] {
  return findings.map(({ rule, path, identity, classification, location }) => ({
    rule,
    path,
    identity,
    classification,
    line: location?.line,
  }));
}
