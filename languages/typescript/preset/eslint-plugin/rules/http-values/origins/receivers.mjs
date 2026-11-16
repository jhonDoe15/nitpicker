import { typeServices } from '../../security/security-values.mjs';
import { GETTER_OWNER, HEADER_BAG, REQUEST_LIKE, URL_LIKE } from './header-tables.mjs';

const HEADER_TYPES = new Set(['Headers', 'IncomingHttpHeaders', 'OutgoingHttpHeaders']);
const REQUEST_TYPES = new Set(['Request', 'IncomingMessage', 'HonoRequest', 'FastifyRequest']);
const URL_TYPES = new Set(['URL', 'Location']);

function typeNames(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return [];
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return (type.isUnion() ? type.types : [type]).map((member) => member.getSymbol()?.name ?? '');
}

function isTyped(context, node, names) {
  return typeNames(context, node).some((name) => names.has(name));
}

export function isHeaderBag(context, node, name) {
  return HEADER_BAG.test(name ?? '') || isTyped(context, node, HEADER_TYPES);
}

export function isRequestLike(context, node, name) {
  return REQUEST_LIKE.test(name ?? '') || isTyped(context, node, REQUEST_TYPES);
}

export function isGetterOwner(context, node, name) {
  return GETTER_OWNER.test(name ?? '') || isTyped(context, node, REQUEST_TYPES);
}

export function isUrlLike(context, node, name) {
  return URL_LIKE.test(name ?? '') || isTyped(context, node, URL_TYPES);
}
