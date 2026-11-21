import { readEngineLinesSync } from '../../../../../shared/engine/engine-rows.mts';
import type { Converted, TreeNode, UnitFact } from '../reuse/near-duplicates/typed/tree-types.mts';
import type { DefinitionFact, ExportFacts, ImportFact } from '../reuse/typed/syntax-types.mts';
import { engineOutput, isListable, type Environment, type ListedFile } from './engine-files.mts';

export type EngineFileFacts = {
  readonly path: string;
  readonly unparsed?: string;
  readonly definitions: readonly DefinitionFact[];
  readonly imports: readonly ImportFact[];
  readonly dynamicImports: readonly string[];
  readonly exports: ExportFacts;
  readonly jsxTags: readonly string[];
  readonly nearDuplicateUnits: readonly UnitFact[];
};

type ImportedName = { readonly specifier: string; readonly name: string };

const parseFacts: (text: string) => EngineFileFacts = JSON.parse;

function importedNames(imports: readonly ImportFact[]): Map<string, ImportedName> {
  const imported = new Map<string, ImportedName>();
  for (const { specifier, defaultName, namespaceName, named } of imports) {
    if (defaultName !== undefined) {
      imported.set(defaultName, { specifier, name: 'default' });
    }
    if (namespaceName !== undefined) {
      imported.set(namespaceName, { specifier, name: '*' });
    }
    for (const { local, imported: name } of named) {
      imported.set(local, { specifier, name });
    }
  }
  return imported;
}

function nodesOf(converted: Converted): readonly TreeNode[] {
  return 'kind' in converted ? [converted] : converted.flatMap((child) => nodesOf(child));
}

function resolveNames(
  root: TreeNode,
  imported: ReadonlyMap<string, ImportedName>,
  moduleOf: (specifier: string) => string,
): TreeNode {
  const pending: TreeNode[] = [root];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const name =
      node.binding === 'free' && node.text !== undefined ? imported.get(node.text) : undefined;
    if (name !== undefined) {
      Object.assign(node, { value: `${moduleOf(name.specifier)}#${name.name}` });
    }
    pending.push(...node.children.flatMap((child) => nodesOf(child)));
  }
  return root;
}

export function resolvedUnits(
  facts: EngineFileFacts,
  moduleOf: (specifier: string) => string,
): UnitFact[] {
  const imported = importedNames(facts.imports);
  return facts.nearDuplicateUnits.map((unit) => ({
    ...unit,
    tree: resolveNames(unit.tree, imported, moduleOf),
  }));
}

export function engineReuseFacts(
  files: readonly ListedFile[],
  environment: Environment,
): Map<string, EngineFileFacts> | undefined {
  const listed = files.filter((file) => isListable(file));
  return engineOutput('typescript-reuse', listed, environment, (out) => {
    const facts = new Map<string, EngineFileFacts>();
    for (const fact of readEngineLinesSync(out, parseFacts)) {
      if (fact.unparsed === undefined) {
        facts.set(fact.path, fact);
      }
    }
    return facts;
  });
}
