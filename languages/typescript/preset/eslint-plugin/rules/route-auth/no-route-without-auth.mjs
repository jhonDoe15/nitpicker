import { nestFacts, routeFacts } from './handlers.mjs';
import { shapeLabel } from './shapes.mjs';

const SEPARATOR = '__';
const FALLBACK = 'fallback';
const OPEN_ON_PURPOSE =
  'An exception fits a route that is open on purpose (a health check, a login, a webhook).';

function followedBy(entries) {
  const followed = new Map();
  for (const entry of entries) {
    const [framework, ...rest] = entry.split(SEPARATOR);
    followed.set(framework, rest.join(SEPARATOR));
  }
  return followed;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Declare the project's auth requirement on every route handler",
    },
    schema: [
      {
        type: 'object',
        properties: { entries: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      missingShape: [
        'This route does not declare {{shape}}, the auth requirement that almost every route in this project',
        'declares, so callers it was not meant for can reach it.',
        'Add {{shape}}, or mark the route public with the marker the project uses.',
        OPEN_ON_PURPOSE,
      ].join(' '),
      missingGuard: [
        'This route has no guard at method or class level and no public marker, while other routes in this',
        'project declare one, so every caller can reach it.',
        'Add a guard (`@UseGuards(...)` or the project auth decorator), or mark the route public.',
        OPEN_ON_PURPOSE,
      ].join(' '),
      missingMiddleware: [
        'This route is registered without `{{middleware}}`, the auth middleware that almost every route in this',
        'project uses, so callers it was not meant for can reach it.',
        'Add `{{middleware}}` to the route, or to the router before it.',
        OPEN_ON_PURPOSE,
      ].join(' '),
    },
  },
  create(context) {
    const followed = followedBy(context.options[0]?.entries ?? []);
    if (followed.size === 0) {
      return {};
    }
    const { visitorKeys } = context.sourceCode;
    function checkNest(program) {
      const shape = followed.get('nest');
      for (const handler of nestFacts(program, visitorKeys).handlers) {
        if (handler.isPublic) {
          continue;
        }
        if (shape !== FALLBACK && !handler.shapes.has(shape)) {
          context.report({
            node: handler.node.key,
            messageId: 'missingShape',
            data: { shape: `\`${shapeLabel(shape)}\`` },
          });
        } else if (shape === FALLBACK && !handler.isAuth) {
          context.report({ node: handler.node.key, messageId: 'missingGuard' });
        }
      }
    }
    function checkRoutes(program) {
      const middleware = followed.get('route');
      for (const route of routeFacts(program, visitorKeys).routes) {
        if (!(route.isPublic || route.shapes.has(middleware))) {
          context.report({
            node: route.node,
            messageId: 'missingMiddleware',
            data: { middleware },
          });
        }
      }
    }
    return {
      Program(program) {
        if (followed.has('nest')) {
          checkNest(program);
        }
        if (followed.has('route')) {
          checkRoutes(program);
        }
      },
    };
  },
};
