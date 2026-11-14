import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { type Fields, fieldAt, requiredFields, requiredText } from '../../scripts/json/fields.mts';
import { type Preset, defaultAcceptance, presetOf } from '../lib/presets.mts';
import { detectJavaBuild } from '../../languages/java/builds/java-build.mjs';
import { loadTree } from '../detectors/tree.mts';

type Trees = ReadonlyMap<string, string>;

export type CaseDefinition = {
  readonly id: string;
  readonly prompt: string;
  readonly preset: Preset;
  readonly directory: string;
  readonly fixtureDirectory: string;
  readonly acceptanceDirectory: string;
  readonly referenceDirectory: string;
  readonly acceptanceCommand: readonly string[];
  readonly pin: Fields;
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly gateArguments?: readonly string[] | undefined;
  readonly agentTimeoutMinutes?: number | undefined;
};

function treeUnder(directory: string): Trees {
  return existsSync(directory) ? loadTree(directory) : new Map();
}

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function textList(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${what} must be a list`);
  return value.map((entry) => requiredText(entry, what));
}

function optionalTextList(value: unknown, what: string): string[] | undefined {
  return value === undefined ? undefined : textList(value, what);
}

function optionalMinutes(value: unknown): number | undefined {
  if (value !== undefined && typeof value !== 'number') {
    throw new Error('agentTimeoutMinutes must be a number');
  }
  return value;
}

function dependenciesOf(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(requiredFields(value, 'dependencies')).map(([name, spec]) => [
      name,
      requiredText(spec, `dependency ${name}`),
    ]),
  );
}

export function loadCase(caseDirectory: string): CaseDefinition {
  const definition = requiredFields(readJson(path.join(caseDirectory, 'case.json')), 'case.json');
  const pinFile = path.join(caseDirectory, 'fixture.json');
  const pin = existsSync(pinFile) ? requiredFields(readJson(pinFile), 'fixture.json') : {};
  const fixtureDirectory = path.join(caseDirectory, 'fixture');
  const acceptanceDirectory = path.join(caseDirectory, 'acceptance');
  const preset = presetOf(definition);
  const acceptanceCommand = fieldAt(definition, 'acceptance', 'command');
  return {
    ...definition,
    id: requiredText(definition['id'], 'case id'),
    prompt: requiredText(definition['prompt'], 'case prompt'),
    preset,
    directory: caseDirectory,
    fixtureDirectory,
    acceptanceDirectory,
    referenceDirectory: path.join(caseDirectory, 'reference'),
    acceptanceCommand:
      acceptanceCommand === undefined || acceptanceCommand === null
        ? defaultAcceptance({
            preset,
            files: treeUnder(acceptanceDirectory),
            buildTool: detectJavaBuild(fixtureDirectory),
          })
        : textList(acceptanceCommand, 'acceptance.command'),
    pin,
    dependencies: dependenciesOf(definition['dependencies']),
    gateArguments: optionalTextList(definition['gateArguments'], 'gateArguments'),
    agentTimeoutMinutes: optionalMinutes(definition['agentTimeoutMinutes']),
  };
}

export function referenceTree(
  caseDefinition: CaseDefinition,
  fixtureTree: Trees,
): Trees | undefined {
  if (!existsSync(caseDefinition.referenceDirectory)) return undefined;
  return new Map([...fixtureTree, ...loadTree(caseDefinition.referenceDirectory)]);
}

export function listCases(casesDirectory: string): CaseDefinition[] {
  return readdirSync(casesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(casesDirectory, entry.name))
    .filter((directory) => existsSync(path.join(directory, 'case.json')))
    .sort()
    .map(loadCase);
}

export function isStale(caseDefinition: CaseDefinition, presetVersion: unknown): boolean {
  return caseDefinition.pin['presetVersion'] !== presetVersion;
}
