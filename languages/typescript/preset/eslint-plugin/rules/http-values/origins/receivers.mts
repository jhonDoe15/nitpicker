import type { TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../security/security-values.mts';
import { GETTER_OWNER, HEADER_BAG, REQUEST_LIKE, URL_LIKE } from './header-tables.mts';

const HEADER_TYPES = new Set(['Headers', 'IncomingHttpHeaders', 'OutgoingHttpHeaders']);
const REQUEST_TYPES = new Set(['Request', 'IncomingMessage', 'HonoRequest', 'FastifyRequest']);
const URL_TYPES = new Set(['URL', 'Location']);

function typeNames(context: Context, node: TSESTree.Node): string[] {
  const services = typeServices(context);
  if (services === undefined) {
    return [];
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return (type.isUnion() ? type.types : [type]).map((member) => member.getSymbol()?.name ?? '');
}

function isTyped(context: Context, node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return typeNames(context, node).some((name) => names.has(name));
}

export function isHeaderBag(
  context: Context,
  node: TSESTree.Node,
  name: string | undefined,
): boolean {
  return HEADER_BAG.test(name ?? '') || isTyped(context, node, HEADER_TYPES);
}

export function isRequestLike(
  context: Context,
  node: TSESTree.Node,
  name: string | undefined,
): boolean {
  return REQUEST_LIKE.test(name ?? '') || isTyped(context, node, REQUEST_TYPES);
}

export function isGetterOwner(
  context: Context,
  node: TSESTree.Node,
  name: string | undefined,
): boolean {
  return GETTER_OWNER.test(name ?? '') || isTyped(context, node, REQUEST_TYPES);
}

export function isUrlLike(
  context: Context,
  node: TSESTree.Node,
  name: string | undefined,
): boolean {
  return URL_LIKE.test(name ?? '') || isTyped(context, node, URL_TYPES);
}
