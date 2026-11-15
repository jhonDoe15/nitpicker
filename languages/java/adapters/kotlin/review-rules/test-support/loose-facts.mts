import {
  argument as typedArgument,
  cleanupCall as typedCleanupCall,
  call as typedCall,
  file as typedFile,
  fn as typedFn,
  importOf as typedImportOf,
  klass as typedKlass,
  loaded as typedLoaded,
  parameter as typedParameter,
  property as typedProperty,
  segment as typedSegment,
  summary,
  testFile as typedTestFile,
  useLaunch as typedUseLaunch,
  wait as typedWait,
} from './facts.mts';
import { readFileSync } from 'node:fs';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import { findingsFor } from './lookup-facts.mts';
import type {
  ArgumentFact,
  CallFact,
  ClassFact,
  CleanupCallFact,
  FileFacts,
  FunctionFact,
  ImportFact,
  LoadedFact,
  ParameterFact,
  PropertyFact,
  SegmentFact,
  UseLaunchFact,
  WaitFact,
} from './facts.mts';

export type Loose = Record<string, unknown>;

export function file(overrides: Loose = {}): FileFacts {
  return { ...typedFile(), ...overrides };
}

export function testFile(overrides: Loose = {}): FileFacts {
  return { ...typedTestFile(), ...overrides };
}

export function klass(name: string, overrides: Loose = {}): ClassFact {
  return { ...typedKlass(name), ...overrides };
}

export function parameter(name: string, type = 'Int', overrides: Loose = {}): ParameterFact {
  return { ...typedParameter(name, type), ...overrides };
}

export function fn(name: string, overrides: Loose = {}): FunctionFact {
  return { ...typedFn(name), ...overrides };
}

export function property(name: string, owner: string, overrides: Loose = {}): PropertyFact {
  return { ...typedProperty(name, owner), ...overrides };
}

export function argument(text: string, overrides: Loose = {}): ArgumentFact {
  return { ...typedArgument(text), ...overrides };
}

export function call(name: string, overrides: Loose = {}): CallFact {
  return { ...typedCall(name), ...overrides };
}

export function segment(name: string, isCall = false, args: Loose[] = []): SegmentFact {
  return typedSegment(name, isCall, args);
}

export function loaded(text: string, context: Loose, overrides: Loose = {}): LoadedFact {
  return { ...typedLoaded(text, context), ...overrides };
}

export function wait(name: string, overrides: Loose = {}): WaitFact {
  return { ...typedWait(name), ...overrides };
}

export function importOf(path: string, overrides: Loose = {}): ImportFact {
  return { ...typedImportOf(path), ...overrides };
}

export function cleanupCall(name: string, overrides: Loose = {}): CleanupCallFact {
  return { ...typedCleanupCall(name), ...overrides };
}

export function useLaunch(overrides: Loose = {}): UseLaunchFact {
  return { ...typedUseLaunch(), ...overrides };
}

export function flagged(overrides: Loose = {}): string[] {
  return summary(findingsFor([file(overrides)]));
}

function isFileFacts(value: unknown): value is FileFacts {
  return typeof fieldOf(value, 'file') === 'string';
}

export function recordedFiles(factsPath: string): FileFacts[] {
  const parsed: unknown = JSON.parse(readFileSync(factsPath, 'utf8'));
  return listOf(fieldOf(parsed, 'files')).filter(isFileFacts);
}
