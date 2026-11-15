import { pythonDependenciesRecipe as untypedDependenciesRecipe } from '../dependencies/dependency-recipe.mjs';
import {
  addDependency as untypedAddDependency,
  addRaw as untypedAddRaw,
  declaredEntries as untypedDeclaredEntries,
} from '../dependencies/pyproject-layout.mjs';
import {
  removeFromArray as untypedRemoveFromArray,
  removeKeyLines as untypedRemoveKeyLines,
} from '../dependencies/toml-edits.mjs';
import {
  arrayElements as untypedArrayElements,
  scanToml as untypedScanToml,
} from '../dependencies/toml-scan.mjs';
import { installedVersions as untypedInstalledVersions } from '../inputs/dependency-inputs.mjs';
import { pythonRestatingDocstringRecipe as untypedDocstringRecipe } from '../restating-docstring.mjs';

export type TextEdit = { start: number; end: number; text: string };
type PlannedFinding = { tool: string; rule: string; path: string; line: number };
type PlannedFix = { edits: TextEdit[]; finding: PlannedFinding };
export type Planned = { fixes: PlannedFix[]; notes?: string[] };
export type TomlKey = { key: string };
export type TomlSection = { name: string; keys: TomlKey[] };
export type DeclaredEntry = {
  normalized: string;
  group: string;
  kind: string;
  raw: string;
  key: TomlKey;
  index: number | undefined;
};

type PlanningRecipe = {
  plan(context: object): Planned;
};

export type FileRecipe = PlanningRecipe & {
  safety: string;
  scope: string;
  presets: string[];
  rules: { rule: string }[];
};

export type ProjectRecipe = FileRecipe & { accepts: (name: string) => boolean };

export const pythonDependenciesRecipe: ProjectRecipe = untypedDependenciesRecipe;
export const pythonRestatingDocstringRecipe: FileRecipe = untypedDocstringRecipe;
export const addDependency: (
  text: string,
  entry: { name: string; version: string; development: boolean },
) => TextEdit | undefined = untypedAddDependency;
export const addRaw: (
  text: string,
  entry: { kind: string; raw: string } | undefined,
) => TextEdit | undefined = untypedAddRaw;
export const declaredEntries: (text: string) => DeclaredEntry[] = untypedDeclaredEntries;
export const removeFromArray: (
  text: string,
  key: TomlKey | undefined,
  index: number | undefined,
) => TextEdit | undefined = untypedRemoveFromArray;
export const removeKeyLines: (key: TomlKey | undefined) => TextEdit | undefined =
  untypedRemoveKeyLines;
export const scanToml: (text: string) => TomlSection[] = untypedScanToml;
export const arrayElements: (
  text: string,
  key: TomlKey | undefined,
) => { elements: { value: string }[] } | undefined = untypedArrayElements;
export const installedVersions: (
  context: object,
  findings: { identity: string }[],
) => Record<string, unknown> = untypedInstalledVersions;
