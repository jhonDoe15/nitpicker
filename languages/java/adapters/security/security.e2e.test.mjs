import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from '../fixtures/gradle-e2e.mjs';
import { runJavaDiff } from '../java-diff.mjs';

// End-to-end test of the find-sec-bugs plugin on the small Gradle fixture. It needs Java 21, Gradle
// and network access to Maven Central, so it only runs with NITPICKER_JAVA_E2E=1 (`npm run test:java`).

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const LOOKUP = `package demo;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;

public final class Lookup {
  private final EntityManager entities;

  public Lookup(EntityManager entities) {
    this.entities = entities;
  }

  public List<?> byName(String name) {
    return entities.createQuery("select u from User u where u.name = '" + name + "'").getResultList();
  }

  public void remember(HttpServletResponse response, String id) {
    response.addCookie(new Cookie("id", id));
  }
}
`;

const REPORTS = `package demo;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

public final class Reports {
  private final NamedParameterJdbcTemplate named;
  private final JdbcClient client;

  public Reports(NamedParameterJdbcTemplate named, JdbcClient client) {
    this.named = named;
    this.client = client;
  }

  private String build(String status) {
    return "select email from account where status = '" + status + "'";
  }

  public List<String> byNamed(String status) {
    return named.queryForList(build(status), Map.of(), String.class);
  }

  public List<String> byClient(String status) {
    return client.sql(build(status)).query(String.class).list();
  }

  public List<String> bound(String status) {
    return named.queryForList("select email from account where status = :s", Map.of("s", status), String.class);
  }
}
`;

let repository;

describe.skipIf(!enabled)('find-sec-bugs end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-security-e2e-'));
    cpSync(path.resolve(import.meta.dirname, '../fixtures/gradle-project'), repository, {
      recursive: true,
    });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base');
    commitBranch(repository, 'injection', {
      'src/main/java/demo/Lookup.java': LOOKUP,
      'src/main/java/demo/Reports.java': REPORTS,
    });
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  it(
    'reports a JPA query and SQL built in a helper once each, and no servlet marker',
    () => {
      const result = runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle });

      expect(
        summarize(result.newEnforceable.filter((finding) => finding.tool === 'spotbugs')),
      ).toEqual([
        'spotbugs SQL_INJECTION_JPA Lookup.java',
        'spotbugs SQL_INJECTION_SPRING_JDBC Reports.java',
        'spotbugs SQL_INJECTION_SPRING_JDBC Reports.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
