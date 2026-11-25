import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren, requiredLiteral } from '../../typed/node-views.mts';
import { BUILT_IN_GRAMMARS, type GrammarSpec } from './built-in-grammars.mts';

export type GrammarFieldTable = {
  readonly allFields: ReadonlySet<string>;
  readonly fieldsByNodeType: ReadonlyMap<string, ReadonlySet<string>>;
};

export type FieldRuleOption = {
  readonly grammarFields?: GrammarSpec;
  readonly nodeTypesPath?: string;
};

const TREE_SITTER_RUNTIMES = new Set(['web-tree-sitter', 'tree-sitter', 'node-tree-sitter']);
const GRAMMAR_PACKAGE = /^(?:@[^/]+\/)?(tree-sitter-[a-z0-9-]+)(?:\/.*)?$/u;
const WASM_GRAMMAR = /(?:^|[/\\])(tree-sitter-[a-z0-9-]+)\.wasm$/u;
const EXCLUDED_PACKAGES = new Set(['tree-sitter-wasms', 'tree-sitter-cli']);

const fileCache = new Map<string, GrammarFieldTable | null>();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tableFromSpec(spec: GrammarSpec): GrammarFieldTable {
  const allFields = new Set<string>();
  const fieldsByNodeType = new Map<string, ReadonlySet<string>>();
  for (const [nodeType, fields] of Object.entries(spec)) {
    fieldsByNodeType.set(nodeType, new Set(fields));
    for (const field of fields) {
      allFields.add(field);
    }
  }
  return { allFields, fieldsByNodeType };
}

function extractNodeTypeEntry(entry: unknown): readonly [string, readonly string[]] | undefined {
  if (!isObjectRecord(entry) || typeof entry['type'] !== 'string') {
    return undefined;
  }
  const fields = isObjectRecord(entry['fields']) ? Object.keys(entry['fields']) : [];
  return [entry['type'], fields];
}

function specFromItems(items: readonly unknown[]): GrammarSpec {
  const spec: Record<string, readonly string[]> = {};
  for (const item of items) {
    const entry = extractNodeTypeEntry(item);
    if (entry !== undefined) {
      spec[entry[0]] = entry[1];
    }
  }
  return spec;
}

function parseNodeTypesJson(raw: string): { value?: GrammarFieldTable; error?: unknown } {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? { value: tableFromSpec(specFromItems(parsed)) } : {};
  } catch (error) {
    return { error };
  }
}

function loadNodeTypesFile(filePath: string): GrammarFieldTable | undefined {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath) ?? undefined;
  }
  if (!existsSync(filePath)) {
    fileCache.set(filePath, null);
    return undefined;
  }
  const { value } = parseNodeTypesJson(readFileSync(filePath, 'utf8'));
  fileCache.set(filePath, value ?? null);
  return value;
}

function tryResolve(
  requireFn: NodeJS.Require,
  specifier: string,
): { value?: string; error?: unknown } {
  try {
    return { value: requireFn.resolve(specifier) };
  } catch (error) {
    return { error };
  }
}

function candidateNodeTypesPaths(grammarName: string): readonly string[] {
  const base = [`${grammarName}/src/node-types.json`, `${grammarName}/node-types.json`];
  if (grammarName === 'tree-sitter-typescript') {
    return [...base, `${grammarName}/typescript/src/node-types.json`];
  }
  return base;
}

function resolveViaRequire(grammarName: string, filename: string): string | undefined {
  const baseUrl = path.isAbsolute(filename) ? filename : import.meta.url;
  const requireFn = createRequire(baseUrl);
  for (const candidate of candidateNodeTypesPaths(grammarName)) {
    const { value } = tryResolve(requireFn, candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function resolveGrammarTable(grammarName: string, filename: string): GrammarFieldTable | undefined {
  const resolved = resolveViaRequire(grammarName, filename);
  if (resolved !== undefined) {
    const loaded = loadNodeTypesFile(resolved);
    if (loaded !== undefined) {
      return loaded;
    }
  }
  const builtIn = BUILT_IN_GRAMMARS[grammarName];
  return builtIn === undefined ? undefined : tableFromSpec(builtIn);
}

function grammarNameFromSpecifier(specifier: string): string | undefined {
  const match = GRAMMAR_PACKAGE.exec(specifier);
  const name = match?.[1];
  return name !== undefined && !EXCLUDED_PACKAGES.has(name) ? name : undefined;
}

function moduleSpecifierOf(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.ImportDeclaration) {
    return typeof node.source.value === 'string' ? node.source.value : undefined;
  }
  if (node.type === AST_NODE_TYPES.ImportExpression) {
    return stringValue(node.source);
  }
  const required = requiredLiteral(node);
  return typeof required === 'string' ? required : undefined;
}

function wasmGrammarIn(node: TSESTree.Node): string | undefined {
  const text = stringValue(node);
  if (text === undefined) {
    return undefined;
  }
  const match = WASM_GRAMMAR.exec(text);
  return match?.[1];
}

function collectFileGrammars(program: TSESTree.Program): readonly string[] {
  const grammars = new Set<string>();
  const wasmGrammars = new Set<string>();
  let hasRuntime = false;
  for (const node of depthFirst(program, nodeChildren)) {
    const specifier = moduleSpecifierOf(node);
    hasRuntime = hasRuntime || (specifier !== undefined && TREE_SITTER_RUNTIMES.has(specifier));
    const grammar = specifier === undefined ? undefined : grammarNameFromSpecifier(specifier);
    if (grammar !== undefined) {
      grammars.add(grammar);
    }
    const wasm = wasmGrammarIn(node);
    if (wasm !== undefined) {
      wasmGrammars.add(wasm);
    }
  }
  return hasRuntime ? [...new Set([...grammars, ...wasmGrammars])] : [...grammars];
}

function mergeEntry(
  fieldsByNodeType: Map<string, Set<string>>,
  allFields: Set<string>,
  entry: readonly [string, ReadonlySet<string>],
): void {
  const [nodeType, fields] = entry;
  const target = fieldsByNodeType.get(nodeType) ?? new Set<string>();
  fieldsByNodeType.set(nodeType, target);
  for (const field of fields) {
    target.add(field);
    allFields.add(field);
  }
}

function mergeTables(tables: readonly GrammarFieldTable[]): GrammarFieldTable | undefined {
  if (tables.length === 0) {
    return undefined;
  }
  const allFields = new Set<string>();
  const fieldsByNodeType = new Map<string, Set<string>>();
  for (const table of tables) {
    for (const field of table.allFields) {
      allFields.add(field);
    }
    for (const entry of table.fieldsByNodeType) {
      mergeEntry(fieldsByNodeType, allFields, entry);
    }
  }
  return { allFields, fieldsByNodeType };
}

function resolveOptionNodeTypes(
  nodeTypesPath: string,
  filename: string,
): GrammarFieldTable | undefined {
  const target = path.isAbsolute(nodeTypesPath)
    ? nodeTypesPath
    : path.resolve(
        path.isAbsolute(filename) ? path.dirname(filename) : process.cwd(),
        nodeTypesPath,
      );
  return loadNodeTypesFile(target);
}

export function resolveActiveGrammar(
  program: TSESTree.Program,
  option: FieldRuleOption | undefined,
  filename: string,
): GrammarFieldTable | undefined {
  const tables: GrammarFieldTable[] = [];
  if (option?.grammarFields !== undefined) {
    tables.push(tableFromSpec(option.grammarFields));
  }
  if (option?.nodeTypesPath !== undefined) {
    const loaded = resolveOptionNodeTypes(option.nodeTypesPath, filename);
    if (loaded !== undefined) {
      tables.push(loaded);
    }
  }
  for (const grammar of collectFileGrammars(program)) {
    const table = resolveGrammarTable(grammar, filename);
    if (table !== undefined) {
      tables.push(table);
    }
  }
  return mergeTables(tables);
}
