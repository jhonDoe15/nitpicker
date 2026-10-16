import { walk } from '../syntax/kotlin-calls.mjs';
import { textOf } from '../syntax/kotlin-tree.mjs';
import {
  CONTROLLERS,
  CROSS_ORIGIN,
  NO_OP_ENCODER,
  REQUEST_BODY,
  REQUEST_MAPPING,
  RESPONSE_BODY,
  VALIDATION,
} from '../names/spring-annotations.mjs';
import {
  BODY_CONTAINERS,
  BODY_ELEMENT_EXEMPT_TYPES,
  BODY_EXEMPT_TYPES,
} from '../names/spring-body-types.mjs';
import { defineRule, hasAnnotation, hitAt, hitOn, isWithin, sitesOfType } from './rule-support.mjs';

const REST_CONTROLLER = new Set(['org.springframework.web.bind.annotation.RestController']);
const PLAIN_CONTROLLER = new Set(['org.springframework.stereotype.Controller']);
const NO_OP_QUALIFIER = 'org.springframework.security.crypto.password.';

const composedMapping = defineRule(
  'SpringComposedMapping',
  'Use @GetMapping, @PostMapping, @PutMapping, @PatchMapping or @DeleteMapping on functions. @RequestMapping belongs only on the class, for the path prefix.',
  (file) =>
    sitesOfType(file, REQUEST_MAPPING)
      .filter((site) => site.kind === 'function')
      .map(hitAt),
);

const restController = defineRule(
  'SpringRestController',
  'Use @RestController for a JSON controller and drop @ResponseBody.',
  (file) =>
    sitesOfType(file, RESPONSE_BODY)
      .filter((site) => {
        const owner = site.owner;
        if (owner === undefined) {
          return false;
        }
        const inRest = file.classes.some(
          (candidate) =>
            hasAnnotation(file, candidate, REST_CONTROLLER) && isWithin(owner, candidate),
        );
        return inRest || (site.kind === 'class' && hasAnnotation(file, owner, PLAIN_CONTROLLER));
      })
      .map(hitAt),
);

function isExemptBody(file, type) {
  if (type === undefined || file.resolver.matches(type.name, BODY_EXEMPT_TYPES)) {
    return true;
  }
  return (
    file.resolver.matches(type.name, BODY_CONTAINERS) &&
    type.args.some(
      (argument) =>
        argument !== undefined && file.resolver.matches(argument.name, BODY_ELEMENT_EXEMPT_TYPES),
    )
  );
}

const validRequestBody = defineRule(
  'SpringValidRequestBody',
  "Add @Valid to this @RequestBody; without it the class's constraints are never checked.",
  (file) =>
    sitesOfType(file, REQUEST_BODY)
      .filter((site) => site.kind === 'parameter')
      .filter((site) => !hasAnnotation(file, site.decl, VALIDATION))
      .filter((site) => !isExemptBody(file, site.decl.type))
      .map(hitAt),
);

const crossOrigin = defineRule(
  'SpringNoCrossOrigin',
  'Configure CORS once, in a CorsConfigurationSource bean with origins from configuration, instead of @CrossOrigin on controllers.',
  (file) => sitesOfType(file, CROSS_ORIGIN).map(hitAt),
);

function isNoOpReference(file, node) {
  const name = textOf(file.source, node);
  const before = file.source.text.slice(Math.max(0, node.s - NO_OP_QUALIFIER.length), node.s);
  return (
    name === 'NoOpPasswordEncoder' &&
    (file.resolver.matches(name, NO_OP_ENCODER) || before === NO_OP_QUALIFIER)
  );
}

const passwordEncoder = defineRule(
  'SpringPasswordEncoder',
  'Hash passwords with PasswordEncoderFactories.createDelegatingPasswordEncoder(); NoOpPasswordEncoder stores them in plain text.',
  (file) =>
    walk(file.tree)
      .map(({ node }) => node)
      .filter((node) => node.t === 'REFERENCE_EXPRESSION' && isNoOpReference(file, node))
      .map((node) => hitOn(node, 'NoOpPasswordEncoder')),
);

export const WEB_RULES = [
  composedMapping,
  restController,
  validRequestBody,
  crossOrigin,
  passwordEncoder,
];
