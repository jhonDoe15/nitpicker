import { collectCalls } from './calls/calls.mts';
import { referenceFacts } from './calls/references.mts';
import { forwardFact } from './calls/forward.mts';
import { decisionFacts } from './decisions/decisions.mts';
import { createScope } from './scope.mts';
import { isEntry } from './signature/entry.mts';
import { declaredReturnType, paramFacts } from './signature/params.mts';
import { ownFieldNames, returnedField } from './uses/own-fields.mts';
import { paramUseFacts } from './uses/param-uses.mts';
import { readFacts } from './uses/reads.mts';
import type { CallableFact, Fact, Scope, Site, State } from '../design-types.mts';

function listed(name: string, items: readonly unknown[]): Fact {
  return items.length === 0 ? {} : { [name]: items };
}

function optionalValue(name: string, value: unknown): Fact {
  return value === undefined ? {} : { [name]: value };
}

function bodyFacts(scope: Scope): Fact {
  return {
    ...optionalValue('forward', forwardFact(scope)),
    ...listed('calls', collectCalls(scope)),
    ...listed('references', referenceFacts(scope)),
    ...listed('paramUses', paramUseFacts(scope)),
    ...listed('ownFields', ownFieldNames(scope)),
    ...optionalValue('returnsField', returnedField(scope)),
    ...listed('decisions', decisionFacts(scope)),
    ...listed('reads', readFacts(scope)),
  };
}

export function callableFact(state: State, site: Site): CallableFact {
  const scope = createScope(state, site);
  const returns = site.kind === 'constructor' ? undefined : declaredReturnType(scope, site.node);
  return {
    id: site.id,
    file: site.file.path,
    name: site.name,
    line: site.line,
    kind: site.kind,
    ...optionalValue('owner', site.owner),
    exported: site.exported,
    ...(isEntry(state, site) ? { entry: true } : {}),
    ...listed('params', paramFacts(scope, site.node)),
    ...optionalValue('returns', returns),
    ...(site.bodyless === true ? {} : bodyFacts(scope)),
  };
}
