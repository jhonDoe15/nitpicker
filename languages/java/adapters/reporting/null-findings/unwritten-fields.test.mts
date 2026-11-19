import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { withoutBoundFields } from './unwritten-fields.mts';

const { temporaryRoot } = useGitFixtures();
const ROOTS = ['src/main/java'];

type Case = { readonly owner: string; readonly field: string };

function unwritten({ owner, field }: Case, read = false) {
  return {
    ruleId: read
      ? 'NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD'
      : 'UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD',
    message: { arguments: read ? [field, 'demo.Use.count(Req)'] : [`demo.Use$${owner}.${field}`] },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'src/main/java/Use.java' },
          region: { startLine: 4 },
        },
        logicalLocations: [{ name: `Use$${owner}.${field}`, kind: 'member' }],
      },
    ],
  };
}

function nullAway(file: string, field: string) {
  return {
    tool: 'errorprone',
    rule: 'NullAway',
    message: `@NonNull field '${field}' not initialized.`,
    path: `src/main/java/${file}`,
    location: { line: 2 },
  };
}

function remaining(files: Readonly<Record<string, string>>, ...found: object[]): number {
  const root = temporaryRoot('bound-fields-');
  writeFiles(
    root,
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [`src/main/java/${name}`, text]),
    ),
  );
  return withoutBoundFields(found, { projectRoot: root, sourceRoots: ROOTS }).length;
}

const DTOS = {
  'OrderRequest.java':
    'class OrderRequest {\n    Long customerId;\n    java.util.List<Item> items;\n}\n',
  'Item.java': 'class Item {\n    String sku;\n}\n',
  'Plain.java': 'class Plain {\n    String label;\n}\n',
};

function use(body: string): string {
  return `class Use {\n    static int count(String json) {\n        ${body}\n        return 1;\n    }\n}\n`;
}

describe('withoutBoundFields', () => {
  it('drops unwritten fields of a Gson target and of the types it holds', () => {
    const files = { ...DTOS, 'Use.java': use('new Gson().fromJson(json, OrderRequest.class);') };

    expect(
      remaining(
        files,
        unwritten({ owner: 'OrderRequest', field: 'items' }),
        unwritten({ owner: 'OrderRequest', field: 'items' }, true),
        unwritten({ owner: 'Item', field: 'sku' }),
        unwritten({ owner: 'Plain', field: 'label' }),
      ),
    ).toBe(1);
  });

  it.each([
    use('mapper.readValue(json, OrderRequest.class);'),
    use('mapper.convertValue(json, OrderRequest.class);'),
    use('new Gson().fromJson(json, new TypeToken<List<OrderRequest>>() {}.getType());'),
    use('mapper.readerFor(OrderRequest.class).readValue(json);'),
    'class Use {\n  String post(@RequestBody OrderRequest body) { return ""; }\n}\n',
  ])('drops them for the binding in %s', (usage) => {
    const field = unwritten({ owner: 'OrderRequest', field: 'items' });

    expect(remaining({ ...DTOS, 'Use.java': usage }, field)).toBe(0);
  });

  it('drops them for a Jackson annotated class and NullAway field findings', () => {
    const annotated =
      'class Use {\n  static class Json {\n    @JsonProperty("n")\n    String name;\n  }\n}\n';
    const files = { 'Use.java': annotated };

    expect(remaining(files, unwritten({ owner: 'Json', field: 'name' }))).toBe(0);
    expect(remaining(files, nullAway('Use.java', 'name'))).toBe(0);
  });

  it('keeps unwritten fields of classes that are never bound', () => {
    const files = { ...DTOS, 'Use.java': use('mapper.readValue(json, OrderRequest.class);') };
    const label = { owner: 'Plain', field: 'label' };

    expect(remaining(files, unwritten(label))).toBe(1);
    expect(remaining(files, unwritten(label, true))).toBe(1);
    expect(remaining(files, nullAway('Plain.java', 'label'))).toBe(1);
  });

  it('keeps unwritten fields of a service class reachable only through a bound field', () => {
    const files = {
      'OrderRequest.java': 'class OrderRequest {\n    Mailer mailer;\n    Item item;\n}\n',
      'Mailer.java': 'class Mailer {\n    String host;\n    void send() {}\n}\n',
      'Item.java': 'class Item {\n    String sku;\n    String getSku() { return sku; }\n}\n',
      'Use.java': use('mapper.readValue(json, OrderRequest.class);'),
    };

    expect(remaining(files, unwritten({ owner: 'Mailer', field: 'host' }))).toBe(1);
    expect(remaining(files, unwritten({ owner: 'Item', field: 'sku' }))).toBe(0);
  });
});
