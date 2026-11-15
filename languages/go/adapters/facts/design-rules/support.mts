import {
  designFacts as untypedDesignFacts,
  fn as untypedFn,
  owner as untypedOwner,
} from '../../../../../shared/rules/design/test-support/design-facts.mjs';
import { goFactFindings } from '../go-fact-findings.mts';
import { goFacts } from '../go-facts.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import type { DesignCallable, DesignType, InspectReport } from '../../go-types.mts';

export const MODULE = 'example.com/shop';

type Fields = { readonly [field: string]: unknown };

const owner: (file: string, name?: string, extra?: Fields) => DesignType = untypedOwner;
const fn: (owned: DesignType, name: string, extra?: Fields) => DesignCallable = untypedFn;

export { fn, owner };

function designFacts(input: {
  types: readonly DesignType[];
  callables: readonly DesignCallable[];
}): { modules: readonly { file: string }[] } {
  const facts: unknown = Reflect.apply(untypedDesignFacts, undefined, [input]);
  return {
    modules: listOf(fieldOf(facts, 'modules')).map((module) => ({
      file: textOf(fieldOf(module, 'file')),
    })),
  };
}

export function goReport({
  types = [],
  callables = [],
}: {
  types?: readonly DesignType[];
  callables?: readonly DesignCallable[];
}): Pick<InspectReport, 'files' | 'definitions' | 'usages' | 'design'> {
  const { modules } = designFacts({ types, callables });
  return {
    files: modules.map(({ file }) => ({
      path: file,
      package: file.split('/').toReversed()[1] ?? 'root',
      test: false,
      generated: false,
      constrained: false,
    })),
    definitions: [],
    usages: [],
    design: { types, callables },
  };
}

export function designRows(
  input: { types?: readonly DesignType[]; callables?: readonly DesignCallable[] },
  rule: string,
  { module = MODULE, policy = {} }: { module?: string; policy?: object } = {},
): { path: string; identity: string; classification: string; line: unknown }[] {
  const findings = goFactFindings(goFacts(goReport(input), { module }), { policy });
  return findings
    .filter((finding) => finding.rule === rule)
    .map(({ path, identity, classification, location }) => ({
      path,
      identity,
      classification,
      line: fieldOf(location, 'line'),
    }));
}
