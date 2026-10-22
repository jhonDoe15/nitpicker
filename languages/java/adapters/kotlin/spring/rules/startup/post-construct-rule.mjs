import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { POST_CONSTRUCT } from '../../names/spring-annotations.mjs';
import { POST_CONSTRUCT_TARGETS } from '../../names/spring-clients.mjs';
import { ENTITY_MANAGER } from '../../names/spring-types.mjs';
import { defineRule, hasAnnotation, hitOn, memberSymbolOf } from '../rule-support.mjs';

const postConstructIo = defineRule(
  'SpringNoPostConstructIo',
  'Move startup work that calls a database or a remote service out of @PostConstruct into an ApplicationRunner or an @EventListener(ApplicationReadyEvent). @PostConstruct runs before the context is ready: there is no transaction around this call, other beans may not be proxied yet, and a failure stops the application from starting.',
  (file, project) => {
    const targets = new Set([
      ...project.repositoryTypes,
      ...ENTITY_MANAGER,
      ...POST_CONSTRUCT_TARGETS,
    ]);
    return file.functions
      .filter((declaration) => declaration.body !== undefined)
      .filter((declaration) => hasAnnotation(file, declaration, POST_CONSTRUCT))
      .flatMap((declaration) => {
        const context = { file, scope: { owner: declaration.owner, fn: declaration } };
        return callsIn(file.source, declaration.body)
          .filter((call) => !call.reference && receiverMatches(context, call, targets))
          .map((call) => hitOn(call.node, `${memberSymbolOf(declaration)}@${call.name}`));
      });
  },
);

export const POST_CONSTRUCT_RULES = [postConstructIo];
