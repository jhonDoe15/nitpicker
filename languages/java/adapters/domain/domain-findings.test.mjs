import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { readClassGraph } from '../features/class-graph.mjs';
import { featureProjects, javaSources, rows } from '../features/test-support/feature-project.mjs';
import { domainFindings } from './domain-findings.mjs';

const { project: featureProject, remove } = featureProjects();

afterEach(remove);

const DOMAIN = 'com.acme.orders.domain';
const FOLDER = 'src/main/java/com/acme/orders/domain';
const ORDER = `${DOMAIN}.Order`;
const ORDER_FILE = `${FOLDER}/Order.java`;

function findings({ classes, edges, files }) {
  const project = featureProject({
    files: { ...javaSources(classes.filter((name) => !name.endsWith('Kt'))), ...files },
    modules: [{ classes, edges }],
  });
  return domainFindings(readClassGraph(project.root, project.projects), {
    projectRoot: project.root,
  });
}

function hint(rule, file = ORDER_FILE) {
  return exceptionHint(`coupling/${rule}`, file);
}

describe('domain boundaries on the class graph', () => {
  it('reports a domain class using adapter code, once per adapter file', () => {
    const adapter = 'com.acme.orders.adapters.jdbc.JdbcOrders';
    const infra = 'com.acme.infra.Clock';
    const found = findings({
      classes: [ORDER, `${DOMAIN}.Line`, adapter, infra, 'com.acme.orders.adapters.domain.Mapper'],
      edges: [
        [ORDER, adapter],
        [`${ORDER}$Builder`, adapter],
        [ORDER, infra],
        [ORDER, `${DOMAIN}.Line`],
        [adapter, ORDER],
        ['com.acme.orders.adapters.domain.Mapper', infra],
      ],
    });

    expect(found).toEqual([
      {
        tool: 'coupling',
        rule: 'domain-imports-adapter',
        path: ORDER_FILE,
        identity: 'domain-adapter:src/main/java/com/acme/infra/Clock.java',
        message: `Have Order depend on a port the domain declares, not on adapter code: it uses Clock from com.acme.infra. Declare the interface Order needs in the domain, implement it in the adapter, and let the composition root pass the implementation in. ${hint('domain-imports-adapter')}`,
        classification: 'enforceable',
      },
      {
        tool: 'coupling',
        rule: 'domain-imports-adapter',
        path: ORDER_FILE,
        identity: 'domain-adapter:src/main/java/com/acme/orders/adapters/jdbc/JdbcOrders.java',
        message: `Have Order depend on a port the domain declares, not on adapter code: it uses JdbcOrders from com.acme.orders.adapters.jdbc. Declare the interface Order needs in the domain, implement it in the adapter, and let the composition root pass the implementation in. ${hint('domain-imports-adapter')}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('reports each kind of infrastructure library, grouped by package, and leaves values alone', () => {
    const found = findings({
      classes: [ORDER],
      edges: [
        [ORDER, 'java.nio.file.Files'],
        [ORDER, 'java.nio.file.Path'],
        [ORDER, 'java.util.UUID'],
        [ORDER, 'java.time.Instant'],
        [ORDER, 'jakarta.persistence.Entity'],
        [ORDER, 'jakarta.persistence.Id'],
        [ORDER, 'jakarta.persistence.EntityManager'],
        [ORDER, 'org.springframework.jdbc.core.JdbcTemplate'],
        [ORDER, 'org.springframework.jdbc.core.RowMapper'],
        [ORDER, 'org.slf4j.Logger'],
        [ORDER, 'org.slf4j.LoggerFactory'],
        [ORDER, 'java.util.Random'],
        [ORDER, 'org.springframework.context.ApplicationContext'],
        [ORDER, 'org.springframework.data.jpa.repository.JpaRepository'],
        [ORDER, 'kotlin.io.FilesKt__FileReadWriteKt'],
        [ORDER, 'java.lang.System$Logger'],
      ],
    });

    expect(rows(found)).toEqual([
      [`domain-imports-client`, ORDER_FILE, 'library:jakarta.persistence'],
      [`domain-imports-client`, ORDER_FILE, 'library:org.springframework.data.jpa.repository'],
      [`domain-imports-client`, ORDER_FILE, 'library:org.springframework.jdbc.core'],
      [`domain-imports-framework-context`, ORDER_FILE, 'library:org.springframework.context'],
      [`domain-imports-io`, ORDER_FILE, 'library:java.nio.file'],
      [`domain-imports-io`, ORDER_FILE, 'library:kotlin.io'],
      [`domain-imports-logger`, ORDER_FILE, 'library:java.lang'],
      [`domain-imports-logger`, ORDER_FILE, 'library:org.slf4j'],
      [`domain-imports-random`, ORDER_FILE, 'library:java.util'],
    ]);
    expect(found.map(({ message }) => message)).toEqual([
      `Reach databases, HTTP services and brokers through a port the domain declares, not from Order: it uses EntityManager (jakarta.persistence). Declare a repository or gateway interface in the domain and implement it with EntityManager in an adapter. ${hint('domain-imports-client')}`,
      `Reach databases, HTTP services and brokers through a port the domain declares, not from Order: it uses JpaRepository (org.springframework.data.jpa.repository). Declare a repository or gateway interface in the domain and implement it with JpaRepository in an adapter. ${hint('domain-imports-client')}`,
      `Reach databases, HTTP services and brokers through a port the domain declares, not from Order: it uses JdbcTemplate, RowMapper (org.springframework.jdbc.core). Declare a repository or gateway interface in the domain and implement it with JdbcTemplate in an adapter. ${hint('domain-imports-client')}`,
      `Take the collaborators of Order as constructor parameters instead of looking them up: it uses ApplicationContext (org.springframework.context). Let the composition root wire the domain. ${hint('domain-imports-framework-context')}`,
      `Pass the results of I/O into Order as values, or call a port the domain declares: it uses Files (java.nio.file), which does file, network, thread or process work. Do that work in an adapter that implements the port. ${hint('domain-imports-io')}`,
      `Pass the results of I/O into Order as values, or call a port the domain declares: it uses FilesKt (kotlin.io), which does file, network, thread or process work. Do that work in an adapter that implements the port. ${hint('domain-imports-io')}`,
      `Return what happened from Order instead of logging there: it uses System.Logger (java.lang). Return a result or a domain event and let the adapter or application layer log it. ${hint('domain-imports-logger')}`,
      `Return what happened from Order instead of logging there: it uses Logger, LoggerFactory (org.slf4j). Return a result or a domain event and let the adapter or application layer log it. ${hint('domain-imports-logger')}`,
      `Pass ids and random values into Order: it uses Random (java.util). Take them as parameters, or through an id or random source port the domain declares and an adapter implements. ${hint('domain-imports-random')}`,
    ]);
  });

  it('finds UUID.randomUUID() and Uuid.random() in the domain source, not in comments or strings', () => {
    const kotlinFile = `src/main/kotlin/com/acme/orders/domain/Ids.kt`;
    const found = findings({
      classes: [ORDER, `${DOMAIN}.Receipt`, `${DOMAIN}.Note`, `${DOMAIN}.IdsKt`],
      edges: [],
      files: {
        [ORDER_FILE]: `package ${DOMAIN};\n\nimport java.util.UUID;\n\nclass Order {\n  UUID id = UUID.randomUUID();\n}\n`,
        [`${FOLDER}/Receipt.java`]: `package ${DOMAIN};\n\nimport static java.util.UUID.randomUUID;\n\nclass Receipt {\n  Object id = randomUUID();\n}\n`,
        [`${FOLDER}/Note.java`]: `package ${DOMAIN};\n\nclass Note {\n  // UUID.randomUUID()\n  String text = "UUID.randomUUID()";\n  Object id = java.util.UUID.nameUUIDFromBytes(new byte[0]);\n}\n`,
        [kotlinFile]: `package ${DOMAIN}\n\nimport kotlin.uuid.Uuid\n\nfun newId() = Uuid.random()\n`,
      },
    });

    expect(rows(found)).toEqual([
      ['domain-imports-random', `${FOLDER}/Order.java`, 'library:java.util'],
      ['domain-imports-random', `${FOLDER}/Receipt.java`, 'library:java.util'],
      ['domain-imports-random', kotlinFile, 'library:kotlin.uuid'],
    ]);
    expect(found[0].message).toBe(
      `Pass ids and random values into Order: it uses UUID.randomUUID() (java.util). Take them as parameters, or through an id or random source port the domain declares and an adapter implements. ${hint('domain-imports-random')}`,
    );
  });

  it('shows the path when the domain reaches I/O through a helper outside the domain', () => {
    const helper = 'com.acme.shared.Pricing';
    const store = 'com.acme.shared.store.PriceStore';
    const pure = 'com.acme.shared.Money';
    const found = findings({
      classes: [ORDER, `${DOMAIN}.Line`, helper, store, pure, 'com.acme.orders.adapters.Feed'],
      edges: [
        [ORDER, helper],
        [ORDER, pure],
        [`${DOMAIN}.Line`, 'com.acme.orders.adapters.Feed'],
        [helper, store],
        [store, 'org.springframework.jdbc.core.JdbcTemplate'],
        ['com.acme.orders.adapters.Feed', 'okhttp3.OkHttpClient'],
        [pure, 'java.util.Random'],
      ],
    });

    expect(found.filter(({ rule }) => rule === 'domain-reaches-io')).toEqual([
      {
        tool: 'coupling',
        rule: 'domain-reaches-io',
        path: ORDER_FILE,
        identity: 'domain-reach:src/main/java/com/acme/shared/Pricing.java',
        message: `Keep I/O behind a port the domain declares, also when a helper does it: Order uses Pricing -> PriceStore, which uses JdbcTemplate, a database, HTTP or messaging client. Do that work in an adapter that implements the port, or pass its result into Order as a value. ${hint('domain-reaches-io')}`,
        classification: 'enforceable',
      },
    ]);
  });
});
