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
]);
const WIRING_PATTERNS = [
  /^org\.springframework\.boot\.actuate\.endpoint\.(?:\w+\.)*\w*(?:Endpoint|Extension)$/u,
  /^(?:jakarta|javax)\.servlet\.annotation\.Web(?:Servlet|Filter|Listener)$/u,
  /^(?:jakarta|javax)\.websocket\.server\.ServerEndpoint$/u,
  /^(?:jakarta|javax)\.ejb\.(?:Stateless|Stateful|Singleton|MessageDriven|Startup)$/u,
  /^(?:jakarta|javax)\.enterprise\.context\.(?:\w+Scoped|Dependent)$/u,
  /^org\.springframework\.data\.(?:\w+\.)*\w*Repository$/u,
];

function isWiring(target) {
  return WIRING_ANNOTATIONS.has(target) || WIRING_PATTERNS.some((pattern) => pattern.test(target));
}

function grownWiring(candidates, wiring = new Set()) {
  const added = candidates
    .filter(({ source, target }) => !wiring.has(source) && (isWiring(target) || wiring.has(target)))
    .map(({ source }) => source);
  return added.length === 0 ? wiring : grownWiring(candidates, new Set([...wiring, ...added]));
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
