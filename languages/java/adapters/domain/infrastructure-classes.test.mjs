import { describe, expect, it } from 'vitest';
import { concernOf } from './infrastructure-classes.mjs';
import { isAdapter, isDomain, libraryPackage } from './domain-roles.mjs';

function ruleOf(className) {
  return concernOf(className)?.rule;
}

describe('infrastructure classes', () => {
  it('names the concern of each infrastructure class a domain may not use', () => {
    const classes = {
      'java.io.FileReader': 'domain-imports-io',
      'java.nio.file.Files': 'domain-imports-io',
      'java.net.http.HttpClient': 'domain-imports-io',
      'java.net.http.HttpClient$Builder': 'domain-imports-io',
      'java.util.concurrent.Executors': 'domain-imports-io',
      'kotlin.concurrent.ThreadsKt': 'domain-imports-io',
      'kotlin.io.path.PathsKt__PathReadWriteKt': 'domain-imports-io',
      'java.sql.Connection': 'domain-imports-client',
      'javax.persistence.EntityManagerFactory': 'domain-imports-client',
      'org.hibernate.Session': 'domain-imports-client',
      'org.springframework.web.client.RestClient': 'domain-imports-client',
      'org.springframework.web.reactive.function.client.WebClient': 'domain-imports-client',
      'org.springframework.data.repository.CrudRepository': 'domain-imports-client',
      'org.springframework.data.mongodb.repository.MongoRepository': 'domain-imports-client',
      'okhttp3.OkHttpClient': 'domain-imports-client',
      'io.ktor.client.HttpClient': 'domain-imports-client',
      'org.apache.kafka.clients.producer.KafkaProducer': 'domain-imports-client',
      'software.amazon.awssdk.services.s3.S3Client': 'domain-imports-client',
      'io.github.oshai.kotlinlogging.KotlinLogging': 'domain-imports-logger',
      'java.util.logging.Logger': 'domain-imports-logger',
      'java.security.SecureRandom': 'domain-imports-random',
      'kotlin.random.Random$Default': 'domain-imports-random',
      'com.github.f4b6a3.ulid.UlidCreator': 'domain-imports-random',
      'org.springframework.beans.factory.BeanFactory': 'domain-imports-framework-context',
      'io.quarkus.arc.Arc': 'domain-imports-framework-context',
    };

    expect(Object.fromEntries(Object.keys(classes).map((name) => [name, ruleOf(name)]))).toEqual(
      classes,
    );
  });

  it('leaves values, mapping annotations and look-alike packages alone', () => {
    const values = [
      'java.nio.file.Path',
      'java.util.UUID',
      'java.time.Instant',
      'java.net.URI',
      'jakarta.persistence.Entity',
      'jakarta.persistence.Column',
      'org.springframework.data.annotation.Id',
      'org.springframework.data.domain.Pageable',
      'kotlin.io.ConsoleKt',
      'java.io.Serializable',
      'org.slf4jx.Helper',
      'mutable.Thing',
    ];

    expect(values.map(ruleOf)).toEqual(values.map(() => undefined));
  });

  it('tells domain packages from adapter packages by segment', () => {
    const entry = (packageName) => ({ packageName });

    expect(
      [
        'acme.orders.domain',
        'acme.domain.model',
        'acme.orders.domain.adapters',
        'acme.domains',
      ].map((name) => isDomain(entry(name))),
    ).toEqual([true, true, false, false]);
    expect(
      ['acme.infra.db', 'acme.orders.adapter', 'acme.infrastructure', 'acme.infrared'].map((name) =>
        isAdapter(entry(name)),
      ),
    ).toEqual([true, true, true, false]);
    expect(['java.util.Random', 'Top', 'a.b.C$D'].map(libraryPackage)).toEqual([
      'java.util',
      'Top',
      'a.b',
    ]);
  });
});
