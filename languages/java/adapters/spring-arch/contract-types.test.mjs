import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSpringArchFindings, SPRING_ARCH_REPORT } from './spring-arch.mjs';
import { featureFaceMatcher } from './contract-types.mjs';

const RULE = 'contract-infrastructure-type';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function read(violations, options = {}) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-contract-types-'));
  temporaryRoots.push(reportRoot);
  writeFileSync(
    path.join(reportRoot, SPRING_ARCH_REPORT),
    JSON.stringify({ root: 'com.shop', violations }),
  );
  return readSpringArchFindings(reportRoot, {
    resolvePath: (className) => `src/main/java/${className.replaceAll('.', '/')}.java`,
    ...options,
  });
}

function contract(className, detail) {
  return { rule: RULE, className, fileName: '', detail };
}

describe('contract-infrastructure-type findings', () => {
  it.each([
    [
      'service|persistence|rows:java.sql.ResultSet',
      'AccountService|rows:ResultSet',
      'Take a repository or a port interface and return a record (DTO) or a domain type from AccountService.rows: ResultSet is a persistence handle, so every caller of this service depends on the database session. Keep ResultSet inside the repository or adapter that owns the transaction.',
    ],
    [
      'feature|transport|respond:jakarta.servlet.http.HttpServletResponse',
      'AccountService|respond:HttpServletResponse',
      "Take plain values and return a record (DTO) or a domain type in AccountService.respond: HttpServletResponse is a web request or response object, so every caller of this feature's public class needs a live HTTP exchange. Read it in the controller or adapter and pass the values in.",
    ],
  ])(
    'leads with the allowed form and ends with the exception route: %s',
    (detail, identity, message) => {
      const [finding] = read([contract('com.shop.accounts.AccountService', detail)]);

      expect(finding).toEqual({
        tool: 'archunit',
        rule: RULE,
        path: 'src/main/java/com/shop/accounts/AccountService.java',
        identity,
        message: `${message} If this is intended, add {"rule":"archunit/${RULE}","paths":["src/main/java/com/shop/accounts/AccountService.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
        classification: 'enforceable',
        symbol: 'AccountService',
      });
    },
  );

  it('keeps the identity when the leaked type moves to another package', () => {
    const before = read([contract('com.shop.a.Accounts', 'feature|persistence|Batch.run:a.Conn')]);
    const after = read([contract('com.shop.a.Accounts', 'feature|persistence|Batch.run:b.Conn')]);

    expect([before[0].identity, after[0].identity]).toEqual([
      'Accounts|Batch.run:Conn',
      'Accounts|Batch.run:Conn',
    ]);
  });

  it('keeps a class outside the Spring roles only when it is directly in a feature folder', () => {
    const findings = read(
      [
        contract(
          'com.acme.features.orders.OrderStore',
          'package|persistence|open:java.sql.Connection',
        ),
        contract(
          'com.acme.features.orders.internal.Jdbc',
          'package|persistence|rows:java.sql.ResultSet',
        ),
        contract(
          'com.acme.billing.Ledger',
          'package|persistence|entities:jakarta.persistence.EntityManager',
        ),
      ],
      { isFeatureFace: featureFaceMatcher({ layout: {}, modulePath: '' }) },
    );

    expect(findings.map((finding) => finding.symbol)).toEqual(['OrderStore']);
  });

  it('drops the Spring rules of a module that does not use Spring and keeps the contract rule', () => {
    const findings = read(
      [
        {
          rule: 'spring-test-placement',
          className: 'com.shop.OrderTest',
          fileName: '',
          detail: '',
        },
        contract(
          'com.shop.orders.OrderService',
          'service|persistence|session:org.hibernate.Session',
        ),
      ],
      { spring: false },
    );

    expect(findings.map((finding) => finding.rule)).toEqual([RULE]);
  });

  it('rejects a detail it cannot describe', () => {
    expect(() => read([contract('com.shop.A', 'service|cache|get:x.Y')])).toThrow(
      `Unknown ${RULE} detail service|cache|get:x.Y`,
    );
  });
});

describe('featureFaceMatcher', () => {
  it.each([
    [{}, '', 'app/src/main/java/com/acme/features/orders/OrderStore.java', true],
    [{}, '', 'app/src/main/java/com/acme/features/orders/internal/Jdbc.java', false],
    [{}, '', 'app/src/main/java/com/acme/features/Root.java', false],
    [{}, '', 'app/src/main/java/com/acme/features/shared/Clock.java', false],
    [{}, 'app', 'src/main/kotlin/com/acme/features/orders/Orders.kt', true],
    [
      { featureRoots: ['app/src/main/java/com/acme/modules'] },
      'app',
      'src/main/java/com/acme/modules/orders/A.java',
      true,
    ],
    [
      { featureRoots: ['other/features'] },
      'app',
      'src/main/java/com/acme/features/orders/A.java',
      false,
    ],
    [{ featureRoots: [] }, '', 'src/main/java/com/acme/features/orders/A.java', false],
  ])(
    'reads the feature roots against the project-relative path: %j %s %s',
    (layout, modulePath, file, expected) => {
      expect(featureFaceMatcher({ layout, modulePath })(file)).toBe(expected);
    },
  );
});

function quotedNames(file, start, end) {
  const text = readFileSync(path.resolve(import.meta.dirname, file), 'utf8');
  const from = text.indexOf(start);
  const block = text.slice(from, text.indexOf(end, from));
  return [...block.matchAll(/"([a-z]+)"/gu)].map(([, name]) => name).sort();
}

describe('infrastructure package names', () => {
  it('are the module names the Python preset skips', () => {
    const jvm = quotedNames(
      '../../gradle/archunit/contracts/Contracts.java',
      'INFRASTRUCTURE_NAMES',
      ';',
    );
    const python = quotedNames(
      '../../../python/rules/contracts/contract_types.py',
      'INFRASTRUCTURE_MODULES',
      '}',
    );

    expect(jvm).toEqual(python);
    expect(jvm).toContain('security');
  });
});
