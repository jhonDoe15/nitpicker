import type { InputTree, SpecNode } from './contract-types.mts';
import type { Primitive } from './syntax-types.mts';

export function isTree(spec: SpecNode): spec is InputTree {
  return typeof spec === 'object' && !Array.isArray(spec);
}

function isPrimitiveList(spec: SpecNode): spec is readonly Primitive[] {
  return Array.isArray(spec);
}

export function domainOf(spec: SpecNode): readonly Primitive[] | undefined {
  if (!isTree(spec)) {
    return undefined;
  }
  const domain = spec['oneOf'];
  return domain !== undefined && isPrimitiveList(domain) ? domain : undefined;
}

export function childSpec(spec: SpecNode, key: string): SpecNode {
  return isTree(spec) && Object.hasOwn(spec, key) ? spec[key] : undefined;
}
