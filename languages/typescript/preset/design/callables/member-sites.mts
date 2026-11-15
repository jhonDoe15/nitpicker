import type TypeScript from 'typescript';
import { ts } from '../syntax/typed.mts';
import { wrappedFunction } from '../syntax/function-values.mts';
import { lineOf, memberName } from '../syntax/nodes.mts';
import type { OwnedFile, Site, SiteMember, SiteNode, TypeEntry } from '../design-types.mts';

const HIDDEN = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;

function isHiddenMember(member: SiteMember): boolean {
  return (
    (member.name !== undefined && ts.isPrivateIdentifier(member.name)) ||
    (ts.getEffectiveModifierFlags(member) & HIDDEN) !== 0
  );
}

function memberKind(member: SiteMember): Site['kind'] {
  if (ts.isConstructorDeclaration(member)) {
    return 'constructor';
  }
  return ts.isGetAccessorDeclaration(member) ? 'accessor' : 'method';
}

function siblingsOf({ parent }: SiteMember): readonly SiteMember[] {
  return ts.isClassLike(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeLiteralNode(parent)
    ? parent.members
    : [];
}

function isSingle(member: SiteMember): boolean {
  const name = memberName(member);
  return !siblingsOf(member).some(
    (other) => other !== member && other.kind === member.kind && memberName(other) === name,
  );
}

function hasBody(member: SiteMember): boolean {
  return 'body' in member && member.body !== undefined;
}

function isBodylessMember(
  member: SiteMember,
): member is
  TypeScript.MethodSignature | TypeScript.MethodDeclaration | TypeScript.GetAccessorDeclaration {
  const isSignature =
    ts.isInterfaceDeclaration(member.parent) &&
    (ts.isMethodSignature(member) || ts.isGetAccessorDeclaration(member));
  const isAbstract =
    (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Abstract) !== 0 &&
    (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member));
  return (isSignature || isAbstract) && !hasBody(member) && isSingle(member);
}

function memberFunction(member: SiteMember): SiteNode | undefined {
  if (ts.isPropertyDeclaration(member)) {
    return wrappedFunction(member.initializer);
  }
  const isCallable =
    ts.isMethodDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member);
  return isCallable && member.body !== undefined ? member : undefined;
}

export function memberSite(
  owner: { entry: TypeEntry; file: OwnedFile },
  member: SiteMember,
): Omit<Site, 'id'> | undefined {
  const bodyless = isBodylessMember(member);
  const node = bodyless ? member : memberFunction(member);
  if (node === undefined) {
    return undefined;
  }
  const { entry, file } = owner;
  const name = ts.isConstructorDeclaration(member)
    ? 'constructor'
    : (memberName(member) ?? 'default');
  return {
    name,
    kind: memberKind(member),
    owner: entry.id,
    node,
    declaration: member,
    member,
    classEntry: entry,
    ...((ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Static) === 0
      ? {}
      : { isStatic: true }),
    file,
    exported: entry.exported && !isHiddenMember(member),
    line: lineOf(member.name ?? member),
    ...(bodyless ? { bodyless: true } : {}),
  };
}
