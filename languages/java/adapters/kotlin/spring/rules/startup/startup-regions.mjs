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

function usedOnlyIn(file, owner, member, regions) {
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

export function startupFunctions(file, owner, starts) {
  const known = new Set(starts.functions);
  const rounds = [known.size];
  for (const size of rounds) {
    const regions = [...starts.nodes, ...[...known].map(({ node }) => node)];
    for (const member of owner.functions) {
      if (!known.has(member) && usedOnlyIn(file, owner, member, regions)) {
        known.add(member);
      }
    }
    if (known.size > size) {
      rounds.push(known.size);
    }
  }
  return known;
}
