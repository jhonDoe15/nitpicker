import ts from 'typescript';
import { wrappedFunction } from '../syntax/function-values.mjs';
import { lineOf, memberName } from '../syntax/nodes.mjs';

const HIDDEN = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;

function isHiddenMember(member) {
  return (
    (member.name !== undefined && ts.isPrivateIdentifier(member.name)) ||
    (ts.getEffectiveModifierFlags(member) & HIDDEN) !== 0
  );
}

function memberKind(member) {
  if (ts.isConstructorDeclaration(member)) {
    return 'constructor';
  }
  return ts.isGetAccessorDeclaration(member) ? 'accessor' : 'method';
}

function isSingle(member) {
  const name = memberName(member);
  return !member.parent.members.some(
    (other) => other !== member && other.kind === member.kind && memberName(other) === name,
  );
}

function isBodylessMember(member) {
  const isSignature =
    ts.isInterfaceDeclaration(member.parent) &&
    (ts.isMethodSignature(member) || ts.isGetAccessorDeclaration(member));
  const isAbstract =
    (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Abstract) !== 0 &&
    (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member));
  return (isSignature || isAbstract) && member.body === undefined && isSingle(member);
}

function memberFunction(member) {
  if (ts.isPropertyDeclaration(member)) {
    return wrappedFunction(member.initializer);
  }
  const isCallable =
    ts.isMethodDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member);
  return isCallable && member.body !== undefined ? member : undefined;
}

export function memberSite(owner, member) {
  const bodyless = isBodylessMember(member);
  const node = bodyless ? member : memberFunction(member);
  if (node === undefined) {
    return undefined;
  }
  const { entry, file } = owner;
  const name = ts.isConstructorDeclaration(member) ? 'constructor' : memberName(member);
  return {
    name,
    kind: memberKind(member),
    owner: entry.id,
    node,
    declaration: member,
    member,
    classEntry: entry,
    isStatic: (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Static) !== 0,
    file,
    exported: entry.exported && !isHiddenMember(member),
    line: lineOf(member.name ?? member),
    ...(bodyless ? { bodyless: true } : {}),
  };
}
