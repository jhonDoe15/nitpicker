import { outerClass } from '../metrics/java-coupling.mjs';

const ANNOTATION_TYPE = 'java.lang.annotation.Annotation';
const APPLICATION = 'org.springframework.boot.autoconfigure.SpringBootApplication';
const WIRING_ANNOTATIONS = new Set([
  'org.springframework.stereotype.Component',
  'org.springframework.stereotype.Service',
  'org.springframework.stereotype.Repository',
  'org.springframework.stereotype.Controller',
  'org.springframework.web.bind.annotation.RestController',
  'org.springframework.web.bind.annotation.ControllerAdvice',
  'org.springframework.web.bind.annotation.RestControllerAdvice',
  'org.springframework.context.annotation.Configuration',
  APPLICATION,
  'org.springframework.boot.autoconfigure.AutoConfiguration',
  'org.springframework.boot.context.properties.ConfigurationProperties',
  'org.springframework.cloud.openfeign.FeignClient',
  'jakarta.persistence.Entity',
  'jakarta.persistence.Embeddable',
  'jakarta.persistence.MappedSuperclass',
  'jakarta.persistence.Converter',
  'javax.persistence.Entity',
  'javax.persistence.Embeddable',
  'javax.persistence.MappedSuperclass',
  'javax.persistence.Converter',
  'jakarta.inject.Named',
  'jakarta.inject.Singleton',
  'javax.inject.Named',
  'javax.inject.Singleton',
  'jakarta.ws.rs.Path',
  'javax.ws.rs.Path',
  'jakarta.ws.rs.ApplicationPath',
  'javax.ws.rs.ApplicationPath',
  'jakarta.ws.rs.ext.Provider',
  'javax.ws.rs.ext.Provider',
  'jakarta.interceptor.Interceptor',
  'jakarta.decorator.Decorator',
  'jakarta.annotation.ManagedBean',
  'io.micronaut.http.annotation.Controller',
  'io.micronaut.http.client.annotation.Client',
  'io.micronaut.context.annotation.Factory',
  'io.micronaut.context.annotation.ConfigurationProperties',
  'io.micronaut.context.annotation.Context',
  'io.micronaut.context.annotation.Prototype',
  'io.micronaut.context.annotation.Bean',
  'io.micronaut.context.annotation.EachProperty',
  'io.micronaut.context.annotation.EachBean',
  'io.micronaut.http.annotation.ServerFilter',
  'io.micronaut.http.annotation.ClientFilter',
  'io.micronaut.http.annotation.Filter',
  'io.micronaut.websocket.annotation.ServerWebSocket',
  'io.micronaut.websocket.annotation.ClientWebSocket',
  'org.springframework.boot.SpringBootConfiguration',
  'org.springframework.boot.jackson.JsonComponent',
  'org.springframework.boot.jackson.JacksonComponent',
  'org.springframework.context.annotation.Bean',
  'org.springframework.context.event.EventListener',
  'org.springframework.transaction.event.TransactionalEventListener',
  'org.springframework.scheduling.annotation.Scheduled',
  'org.springframework.scheduling.annotation.Schedules',
  'org.springframework.messaging.handler.annotation.MessageMapping',
  'org.springframework.integration.annotation.ServiceActivator',
  'org.springframework.cloud.stream.annotation.StreamListener',
  'org.eclipse.microprofile.rest.client.inject.RegisterRestClient',
  'org.eclipse.microprofile.config.inject.ConfigProperties',
  'org.eclipse.microprofile.reactive.messaging.Incoming',
  'org.eclipse.microprofile.reactive.messaging.Outgoing',
  'org.eclipse.microprofile.graphql.GraphQLApi',
  'io.smallrye.config.ConfigMapping',
  'io.quarkus.scheduler.Scheduled',
  'io.quarkus.runtime.Startup',
  'io.quarkus.runtime.annotations.QuarkusMain',
  'io.quarkus.arc.Unremovable',
  'jakarta.enterprise.event.Observes',
  'jakarta.enterprise.event.ObservesAsync',
  'javax.enterprise.event.Observes',
  'jakarta.ejb.Schedule',
  'javax.ejb.Schedule',
]);
const WIRING_PATTERNS = [
  /^org\.springframework\.boot\.actuate\.endpoint\.(?:\w+\.)*\w*(?:Endpoint|Extension)$/u,
  /^(?:jakarta|javax)\.servlet\.annotation\.Web(?:Servlet|Filter|Listener)$/u,
  /^(?:jakarta|javax)\.websocket\.server\.ServerEndpoint$/u,
  /^(?:jakarta|javax)\.ejb\.(?:Stateless|Stateful|Singleton|MessageDriven|Startup)$/u,
  /^(?:jakarta|javax)\.enterprise\.context\.(?:\w+Scoped|Dependent)$/u,
  /^org\.springframework\.data\.(?:\w+\.)*\w*Repository$/u,
  /^org\.springframework\.(?:kafka|amqp\.rabbit|jms|pulsar)\.annotation\.\w+(?:Listener|Handler)$/u,
  /^io\.awspring\.cloud\.\w+\.annotation\.\w+Listener$/u,
  /^io\.micronaut\.(?:\w+\.)*annotation\.(?:\w+Listener|Scheduled)$/u,
  /^org\.eclipse\.microprofile\.health\.(?:Liveness|Readiness|Startup)$/u,
];

function isWiring(target) {
  return WIRING_ANNOTATIONS.has(target) || WIRING_PATTERNS.some((pattern) => pattern.test(target));
}

function grownWiring(candidates) {
  const wiring = new Set();
  const pending = candidates.filter(({ target }) => isWiring(target)).map(({ source }) => source);
  for (const annotation of pending) {
    if (!wiring.has(annotation)) {
      wiring.add(annotation);
      pending.push(
        ...candidates.filter(({ target }) => target === annotation).map(({ source }) => source),
      );
    }
  }
  return wiring;
}

function wiringAnnotations(edges, owned) {
  const annotations = new Set(
    edges
      .filter(({ source, target }) => target === ANNOTATION_TYPE && owned.has(source))
      .map(({ source }) => source),
  );
  const wiring = grownWiring(edges.filter(({ source }) => annotations.has(source)));
  return (target) => isWiring(target) || wiring.has(target);
}

function ownedClasses(projects, edges) {
  return new Set([
    ...projects.flatMap((project) => project.classes),
    ...edges.map(({ source }) => source),
  ]);
}

export function mainUsages(projects, resolve) {
  const production = new Set();
  const wired = new Set();
  const applications = new Set();
  const edges = projects.flatMap(({ qualifier, mainEdges }) =>
    mainEdges.map((edge) => ({ ...edge, qualifier })),
  );
  const wires = wiringAnnotations(edges, ownedClasses(projects, edges));
  for (const { source, target, qualifier } of edges) {
    const own = `${qualifier}\0${outerClass(source)}`;
    const used = resolve(target, qualifier);
    if (wires(target)) {
      wired.add(own);
    }
    if (target === APPLICATION) {
      applications.add(qualifier);
    }
    if (used !== undefined && used !== own) {
      production.add(used);
    }
  }
  return { production, wired, applications };
}
