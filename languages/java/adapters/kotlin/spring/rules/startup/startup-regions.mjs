import { callsIn, isSelfCall } from '../../syntax/kotlin-calls.mjs';
import { containsNode } from '../../syntax/expressions/kotlin-scope.mjs';
import { kid, kids } from '../../syntax/kotlin-tree.mjs';

export function initializerNodes(owner) {
  return kids(kid(owner.node, 'CLASS_BODY'), 'CLASS_INITIALIZER');
}

export function secondaryConstructorNodes(owner) {
  return owner.constructors.filter(({ primary }) => !primary).map(({ node }) => node);
}

export function propertyNodes(owner) {
  return owner.properties.filter(({ fromConstructor }) => !fromConstructor).map(({ node }) => node);
}

function usedOnlyIn({ file, owner, regions }, member) {
  if (!member.modifiers.has('private')) {
    return false;
  }
  const uses = callsIn(file.source, owner.node).filter(
    (call) => call.name === member.name && isSelfCall(call),
  );
  return (
    uses.length > 0 && uses.every((use) => regions.some((region) => containsNode(region, use.node)))
  );
}

function addUsedOnlyIn(scope, known) {
  for (const member of scope.owner.functions) {
    if (!known.has(member) && usedOnlyIn(scope, member)) {
      known.add(member);
    }
  }
}

export function startupFunctions(file, owner, starts) {
  const known = new Set(starts.functions);
  const rounds = [known.size];
  for (const size of rounds) {
    const regions = [...starts.nodes, ...[...known].map(({ node }) => node)];
    addUsedOnlyIn({ file, owner, regions }, known);
    if (known.size > size) {
      rounds.push(known.size);
    }
  }
  return known;
}
