import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { typeServices } from '../../security/security-values.mjs';
import { filterCoverage, globalFilters, localFilters } from './exception-filters.mjs';
import {
  ancestorsOf,
  classLabel,
  decoratedWith,
  hasFrameworkStatus,
  hasOpaqueBase,
} from './nest-classes.mjs';
import { pathText, thrownClasses } from './thrown-classes.mjs';

const CONTROLLERS = new Set(['Controller', 'Resolver']);
const HANDLERS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
  'Search',
  'Sse',
  'Query',
  'Mutation',
  'Subscription',
  'ResolveField',
]);

function handlerOf(services, node) {
  const method = services.esTreeNodeToTSNodeMap.get(node);
  const owner = method?.parent;
  const isHandler =
    method !== undefined &&
    ts.isMethodDeclaration(method) &&
    method.body !== undefined &&
    owner !== undefined &&
    ts.isClassLike(owner) &&
    decoratedWith(owner, CONTROLLERS).length > 0 &&
    decoratedWith(method, HANDLERS).length > 0;
  return isHandler ? { method, owner } : undefined;
}

function isMapped(checker, thrown, filters) {
  const chain = ancestorsOf(checker, thrown);
  if (hasFrameworkStatus(chain) || hasOpaqueBase(chain)) {
    return true;
  }
  return filters.some((filter) =>
    filterCoverage(checker, filter).some((caught) => chain.includes(caught)),
  );
}

function registeredFilters(cache, program) {
  if (!cache.has(program)) {
    cache.set(program, globalFilters(program));
  }
  return cache.get(program);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require every exception a NestJS handler can throw to map to a client status',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      unmapped:
        '`{{handler}}` can throw `{{error}}`{{path}}, which no exception filter in scope maps, so the client gets a 500 and the error tracker is paged. Give the class a status once: extend `HttpException` or one of its subclasses (`NotFoundException`, `ForbiddenException`, `BadRequestException`), or catch it in the shared filter with `@Catch({{error}})` registered through `APP_FILTER`. An exception fits only when this class is a server error.',
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    const checker = services.program.getTypeChecker();
    const registered = new Map();
    return {
      MethodDefinition(node) {
        const handler = handlerOf(services, node);
        if (handler === undefined) {
          return;
        }
        const filters = [
          ...localFilters(checker, [handler.method, handler.owner]),
          ...registeredFilters(registered, services.program),
        ];
        const name = `${classLabel(handler.owner)}.${handler.method.name.getText()}`;
        for (const [thrown, path] of thrownClasses(checker, handler.method)) {
          if (!isMapped(checker, thrown, filters)) {
            context.report({
              node: node.key,
              messageId: 'unmapped',
              data: { handler: name, error: classLabel(thrown), path: pathText(path) },
            });
          }
        }
      },
    };
  },
};
