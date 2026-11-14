import { afterEach, describe, expect, it } from 'vitest';
import { buildFixPlans } from '../../../../shared/fix-plans/build-fix-plans.mjs';
import { filesEnvironment } from '../../../../shared/fix-plans/test-support/env.mjs';
import { ruleEntry } from '../../../../shared/reference/entry.mjs';
import { indexEntries } from '../../../../shared/reference/store.mjs';
import { readJvmReuseFindings } from './jvm-reuse-facts.mjs';
import { createReuseProjects } from './test-support/reuse-projects.mjs';

const { project, cleanup } = createReuseProjects();

afterEach(cleanup);

const JAVA_ROOT = 'src/main/java';
const KOTLIN_ROOT = 'src/main/kotlin';
const SINGLE = [{ qualifier: '', sourceRoots: [JAVA_ROOT], kotlinSourceRoots: [KOTLIN_ROOT] }];
const LAYOUT = {
  featureRoots: [`${JAVA_ROOT}/shop/features`, `${KOTLIN_ROOT}/shop/features`],
  sharedRoots: [`${JAVA_ROOT}/shop/shared`, `${KOTLIN_ROOT}/shop/shared`],
};
const INDEX = indexEntries([
  ruleEntry({
    tool: 'structure',
    rule: 'near-duplicate',
    page: 'p',
    analyzers: { java: ['java'] },
    summary: 's',
  }),
]);

const ORDERS = `${JAVA_ROOT}/shop/features/orders/OrderClient.java`;
const INVOICES = `${JAVA_ROOT}/shop/features/invoices/InvoiceClient.java`;

function retry(pkg, className, metric) {
  return `package shop.features.${pkg};

public class ${className} {
  public Response send(Request request, int attempts) {
    for (int attempt = 0; attempt < attempts; attempt++) {
      Response response = client.execute(request.withHeader("X-Attempt", String.valueOf(attempt)));
      if (response.status() < 500) {
        return response;
      }
      metrics.increment("${metric}", request.path());
    }
    throw new IllegalStateException("gave up after " + attempts + " attempts");
  }
}
`;
}

function kotlinRetry(pkg, metric) {
  return `package shop.features.${pkg}

fun send(request: Request, attempts: Int): Response {
  for (attempt in 0 until attempts) {
    val response = client.execute(request.withHeader("X-Attempt", attempt.toString()))
    if (response.status < 500) {
      return response
    }
    metrics.increment("${metric}", request.path)
  }
  throw IllegalStateException("gave up after $attempts attempts")
}
`;
}

function nearDuplicates(files, kotlin = false) {
  return readJvmReuseFindings(project(files), {
    projects: SINGLE,
    kotlin,
    policy: { layout: LAYOUT },
  }).filter(({ rule }) => rule === 'near-duplicate');
}

function planOf(files, kotlin = false) {
  const [plan] = buildFixPlans(nearDuplicates(files, kotlin), {
    index: INDEX,
    env: filesEnvironment(files),
  });
  return plan;
}

function javaCaller({ pkg, className }, { signature, copy }) {
  const values = copy.arguments.map(({ value }) => value);
  return `package shop.features.${pkg};

public class ${className} {
  public Response send(Request request, int attempts) {
    return Retry.${signature.name}(${['request', 'attempts', ...values].join(', ')});
  }
}
`;
}

describe('the extract-shared-function plan for Java classes in two features', () => {
  const files = {
    [ORDERS]: retry('orders', 'OrderClient', 'retry.%s'),
    [INVOICES]: retry('invoices', 'InvoiceClient', 'again.%s'),
  };

  it('names the signature, both call sites and a shared package folder', () => {
    const plan = planOf(files);

    expect(plan.kind).toBe('extract-shared-function');
    expect(plan.context.signature.text).toBe('send(Request request, int attempts, text)');
    expect(plan.context.copies.map(({ path, arguments: args }) => [path, args])).toEqual([
      [ORDERS, [{ parameter: 'text', value: '"retry.%s"' }]],
      [INVOICES, [{ parameter: 'text', value: '"again.%s"' }]],
    ]);
    expect(plan.context.location).toEqual({
      folder: `${JAVA_ROOT}/shop/shared`,
      kind: 'shared',
      reason:
        'the copies are in different places, and shared code may be used by several features (shared-used-by-one-feature)',
    });
  });

  it('stops the finding when an agent follows it', () => {
    const plan = planOf(files);
    const { signature, copies, location } = plan.context;
    const body = retry('x', 'Retry', 'unused')
      .replace('package shop.features.x;', 'package shop.shared;')
      .replace(
        'public Response send(Request request, int attempts)',
        `public static Response ${signature.name}(Request request, int attempts, String text)`,
      )
      .replace('"unused"', 'text');
    const followed = {
      [ORDERS]: javaCaller(
        { pkg: 'orders', className: 'OrderClient' },
        { signature, copy: copies[0] },
      ),
      [INVOICES]: javaCaller(
        { pkg: 'invoices', className: 'InvoiceClient' },
        { signature, copy: copies[1] },
      ),
      [`${location.folder}/Retry.java`]: body,
    };

    expect(nearDuplicates(files)).toHaveLength(1);
    expect(nearDuplicates(followed)).toEqual([]);
  });

  it('keeps the method in the feature when both classes are in one feature', () => {
    const same = {
      [ORDERS]: files[ORDERS],
      [`${JAVA_ROOT}/shop/features/orders/refunds/RefundClient.java`]: retry(
        'orders.refunds',
        'RefundClient',
        'again.%s',
      ),
    };

    expect(planOf(same).context.location.folder).toBe(`${JAVA_ROOT}/shop/features/orders`);
  });
});

describe('the extract-shared-function plan for Kotlin files in two features', () => {
  it('names the signature and a shared folder', () => {
    const orders = `${KOTLIN_ROOT}/shop/features/orders/Orders.kt`;
    const invoices = `${KOTLIN_ROOT}/shop/features/invoices/Invoices.kt`;
    const plan = planOf(
      { [orders]: kotlinRetry('orders', 'retry'), [invoices]: kotlinRetry('invoices', 'again') },
      true,
    );

    expect(plan.context.signature.text).toBe('send(request: Request, attempts: Int, text)');
    expect(plan.context.location.folder).toBe(`${KOTLIN_ROOT}/shop/shared`);
  });
});
