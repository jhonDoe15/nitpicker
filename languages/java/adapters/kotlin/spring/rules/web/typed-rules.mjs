import { walk } from '../../syntax/kotlin-calls.mjs';
import { kid, kids } from '../../syntax/kotlin-tree.mjs';
import { HANDLER_MAPPINGS, REQUEST_BODY } from '../../names/spring-annotations.mjs';
import { defineRule, hasAnnotation, hitOn, memberSymbolOf, sitesOfType } from '../rule-support.mjs';
import { isUntyped } from './untyped-types.mjs';

function nullReturns(declaration) {
  const { body } = declaration;
  if (body?.t === 'NULL') {
    return [body];
  }
  return walk(body)
    .filter(({ node }) => node.t === 'RETURN' && kid(node, 'LABEL_QUALIFIER') === undefined)
    .filter(({ node }) => kids(node).some((child) => child.t === 'NULL'))
    .filter(({ ancestors }) => !ancestors.slice(1).some((node) => node.t === 'FUN'))
    .map(({ node }) => node);
}

const typedResponse = defineRule(
  'SpringTypedResponse',
  'Return a data class or a specific type from this handler, never Any, JsonNode, Map<String, Any>, ResponseEntity<*>, a list or Optional of those, or null. For no body return Unit or ResponseEntity<Void>, and for an error throw an exception that a @RestControllerAdvice maps to a ProblemDetail.',
  (file) =>
    file.functions
      .filter((declaration) => hasAnnotation(file, declaration, HANDLER_MAPPINGS))
      .flatMap((declaration) => [
        ...(isUntyped(file, declaration.returnType)
          ? [hitOn(declaration.returnType.node, memberSymbolOf(declaration))]
          : []),
        ...(declaration.body === undefined ? [] : nullReturns(declaration)).map((node) =>
          hitOn(node, `${memberSymbolOf(declaration)}@null`),
        ),
      ]),
);

const typedRequestBody = defineRule(
  'SpringTypedRequestBody',
  'Bind this @RequestBody to a data class with validation annotations, not to Any, JsonNode, Map<String, Any> or a list of those. Untyped payloads skip validation and allow mass assignment. A Map with typed values, such as Map<String, String>, is fine.',
  (file) =>
    sitesOfType(file, REQUEST_BODY)
      .filter((site) => site.kind === 'parameter' && isUntyped(file, site.decl.type))
      .map((site) => hitOn(site.decl.type.node, `${site.symbol}@RequestBody`)),
);

export const TYPED_RULES = [typedResponse, typedRequestBody];
