import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dropEntityAssociations,
  dropInheritedVersions,
  withExposureAdvice,
} from './jpa-source-filters.mjs';

const roots = [];
const { gitCheckout } = useGitCheckouts();
const SOURCE_ROOTS = ['src/main/java'];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'jpa-filters-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, 'src/main/java', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function exposure(field, ruleId = 'EI_EXPOSE_REP', file = 'Order.java') {
  return {
    ruleId,
    message: { arguments: ['getItems()', `demo.Order.${field}`] },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `src/main/java/${file}` },
          region: { startLine: 5 },
        },
      },
    ],
  };
}

function ruleIds(log) {
  return log.runs[0].results.map((result) => `${result.ruleId}:${result.message.arguments[1]}`);
}

describe('dropEntityAssociations', () => {
  const order = `
class Order {
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "customer_id")
  private Customer customer;
  @OneToOne private Address address;
  @OneToMany private List<Item> items;
  // @ManyToOne private Customer commented;
  private Customer commented;
}
`;

  it('drops associations to one entity and keeps collections and plain fields', () => {
    const root = project({ 'Order.java': order });
    const results = ['customer', 'address', 'items', 'commented'].map((field) => exposure(field));
    const kept = dropEntityAssociations({ runs: [{ results }] }, root);
    expect(ruleIds(kept)).toEqual([
      'EI_EXPOSE_REP:demo.Order.items',
      'EI_EXPOSE_REP:demo.Order.commented',
    ]);
  });

  it('covers EI_EXPOSE_REP2 and leaves other rules and unreadable sources alone', () => {
    const root = project({ 'Order.java': order });
    const results = [
      exposure('customer', 'EI_EXPOSE_REP2'),
      exposure('customer', 'URF_UNREAD_FIELD'),
      exposure('customer', 'EI_EXPOSE_REP', 'Missing.java'),
    ];
    const kept = dropEntityAssociations({ runs: [{ results }] }, root);
    expect(kept.runs[0].results.map((result) => result.ruleId)).toEqual([
      'URF_UNREAD_FIELD',
      'EI_EXPOSE_REP',
    ]);
  });
});

describe('withExposureAdvice', () => {
  it('names the copy and when an exception fits for exposure findings only', () => {
    const advised = withExposureAdvice({ rule: 'EI_EXPOSE_REP2', message: 'May expose' });
    expect(advised.message).toBe(
      'May expose. Copy on the way in and out (List.copyOf, Map.copyOf), or use a record. An exception fits only when it is right here.',
    );
    const other = { rule: 'DLS_DEAD_LOCAL_STORE', message: 'Dead store' };
    expect(withExposureAdvice(other)).toBe(other);
  });
});

describe('dropInheritedVersions', () => {
  const versionFinding = (file) => ({
    tool: 'pmd',
    rule: 'JpaVersion',
    path: `src/main/java/${file}`,
    location: { line: 1 },
  });
  const options = (root) => ({ projectRoot: root, sourceRoots: SOURCE_ROOTS });

  it('drops the finding when a mapped superclass declares @Version', () => {
    const root = project({
      'Base.java': '@MappedSuperclass\nclass Base {\n @Version long version;\n}\n',
      'Mid.java': '@MappedSuperclass\nclass Mid extends Base {\n}\n',
      'Invoice.java': '@Entity\nclass Invoice extends Mid {\n @Id Long id;\n}\n',
    });
    expect(dropInheritedVersions([versionFinding('Invoice.java')], options(root))).toEqual([]);
  });

  it('keeps the finding when no ancestor has a version, or the ancestor is unknown', () => {
    const root = project({
      'Base.java': '@MappedSuperclass\nclass Base {\n @Id Long id;\n}\n',
      'Invoice.java': '@Entity\nclass Invoice extends Base {\n @Id Long id;\n}\n',
      'Quote.java': '@Entity\nclass Quote extends Library {\n @Id Long id;\n}\n',
      'Plain.java': '@Entity\nclass Plain {\n @Id Long id;\n}\n',
    });
    const findings = ['Invoice.java', 'Quote.java', 'Plain.java'].map(versionFinding);
    expect(dropInheritedVersions(findings, options(root))).toEqual(findings);
  });

  it('ignores other findings', () => {
    const other = { tool: 'pmd', rule: 'SpringFieldInjection', path: 'x' };
    expect(dropInheritedVersions([other], options('/nonexistent'))).toEqual([other]);
  });
});

describe('dropInheritedVersions in a Git checkout', () => {
  const finding = {
    tool: 'pmd',
    rule: 'JpaVersion',
    path: 'src/main/java/Invoice.java',
    location: { line: 1 },
  };
  const base = '@MappedSuperclass\nclass Base {\n @Version long version;\n}\n';
  const invoice = '@Entity\nclass Invoice extends Base {\n @Id Long id;\n}\n';
  const options = (root) => ({ projectRoot: root, sourceRoots: SOURCE_ROOTS });

  it('looks for the superclass in the checkout, not in ignored folders or nested checkouts', () => {
    const hidden = gitCheckout(
      {
        'src/main/java/Invoice.java': invoice,
        'src/main/java/gen/Base.java': base,
        ...nestedCheckout('src/main/java/agent', { 'Base.java': base }),
      },
      ['src/main/java/gen/'],
    );
    const visible = gitCheckout({
      'src/main/java/Invoice.java': invoice,
      'src/main/java/Base.java': base,
    });

    expect(dropInheritedVersions([finding], options(hidden))).toEqual([finding]);
    expect(dropInheritedVersions([finding], options(visible))).toEqual([]);
  });
});
