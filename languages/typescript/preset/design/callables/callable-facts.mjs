import { collectCalls } from './calls/calls.mjs';
import { referenceFacts } from './calls/references.mjs';
import { forwardFact } from './calls/forward.mjs';
import { decisionFacts } from './decisions/decisions.mjs';
import { createScope } from './scope.mjs';
import { isEntry } from './signature/entry.mjs';
import { declaredReturnType, paramFacts } from './signature/params.mjs';
import { ownFieldNames, returnedField } from './uses/own-fields.mjs';
import { paramUseFacts } from './uses/param-uses.mjs';
import { readFacts } from './uses/reads.mjs';

function listed(name, items) {
  return items.length === 0 ? {} : { [name]: items };
}

function optionalValue(name, value) {
  return value === undefined ? {} : { [name]: value };
}

function bodyFacts(scope) {
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

export function callableFact(state, site) {
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
