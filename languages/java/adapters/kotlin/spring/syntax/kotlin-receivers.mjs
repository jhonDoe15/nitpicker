import { receiverName } from './kotlin-calls.mjs';
import { descendants, identifierOf, kid } from './kotlin-tree.mjs';
import { typeOf } from './kotlin-types.mjs';

function localType(source, body, name) {
  if (body === undefined) {
    return undefined;
  }
  const local = descendants(
    body,
    (node) => node.t === 'PROPERTY' && identifierOf(source, node) === name,
  )[0];
  return local === undefined ? undefined : typeOf(source, kid(local, 'TYPE_REFERENCE'));
}

function declaredTypeOf({ file, scope }, name) {
  const { owner, fn } = scope;
  return (
    fn?.params.find((parameter) => parameter.name === name)?.type ??
    localType(file.source, fn?.body, name) ??
    owner?.properties.find((property) => property.name === name)?.type
  );
}

export function typeMatches(file, type, names) {
  return type !== undefined && file.resolver.matches(type.name, names);
}

export function receiverMatches(context, call, names) {
  const name = receiverName(context.file.source, call.receiver);
  return name !== undefined && typeMatches(context.file, declaredTypeOf(context, name), names);
}
