import {
  EVERY,
  EVIDENCE_CALLS,
  MEMBER_CALLS,
  OBJECT_METHODS,
  STANDARD_INPUT,
  STATIC_CALLS,
} from './blocking-catalog.mts';
import type {
  BlockingClassification,
  CoroutineCall,
  BlockingProject,
  BlockingResolver,
} from '../typed/kotlin-flow-types.mts';
import { lastSegment } from './type-names.mts';

const TYPE_ALIASES = new Map<string, string[]>([['java.nio.file.Path', ['kotlin.io.path.Path']]]);

function covers(names: string | readonly string[], name: string): boolean {
  return names === EVERY ? !OBJECT_METHODS.includes(name) : names.includes(name);
}

function coversMember(
  entry: { names: string | readonly string[]; extensions?: readonly string[] },
  name: string,
): boolean {
  return covers(entry.names, name) || (entry.extensions ?? []).includes(name);
}

function isOneOf(resolver: BlockingResolver, name: string, qualified: string): boolean {
  return [qualified, ...(TYPE_ALIASES.get(qualified) ?? [])].some((candidate) =>
    resolver.isType(name, candidate),
  );
}

function staticCall(
  call: CoroutineCall,
  resolver: BlockingResolver,
): BlockingClassification | undefined {
  const { staticOwner } = call;
  if (staticOwner === undefined) {
    return undefined;
  }
  for (const entry of STATIC_CALLS) {
    if (
      covers(entry.names, call.name) &&
      entry.owners.some((qualified) => resolver.isType(staticOwner, qualified))
    ) {
      return {
        subject: `${entry.label}.${call.name}`,
        basis: `${lastSegment(entry.owners[0] ?? '')} is a blocking API`,
      };
    }
  }
  return undefined;
}

function memberCall(
  call: CoroutineCall,
  resolver: BlockingResolver,
): BlockingClassification | undefined {
  const { receiverType } = call;
  if (receiverType === undefined || call.qualifier === undefined) {
    return undefined;
  }
  for (const entry of MEMBER_CALLS) {
    const matched = entry.types.find((type) => isOneOf(resolver, receiverType, type));
    if (
      matched !== undefined &&
      coversMember(entry, call.name) &&
      (entry.requires ?? []).every((prefix) => resolver.importsFrom(prefix))
    ) {
      return {
        subject: `${lastSegment(matched)}.${call.name}`,
        basis: `the receiver is declared as ${matched}`,
      };
    }
  }
  return undefined;
}

function evidenceCall(
  call: CoroutineCall,
  resolver: BlockingResolver,
): BlockingClassification | undefined {
  if (call.qualifier === undefined) {
    return undefined;
  }
  for (const entry of EVIDENCE_CALLS) {
    const prefix = entry.imports.find((candidate) => resolver.importsFrom(candidate));
    if (prefix !== undefined && entry.names.includes(call.name)) {
      return { subject: `.${call.name}`, basis: `the file imports ${prefix}*` };
    }
  }
  return undefined;
}

function standardInput(
  call: CoroutineCall,
  project: BlockingProject,
): BlockingClassification | undefined {
  return call.qualifier === undefined &&
    call.arguments === 0 &&
    STANDARD_INPUT.includes(call.name) &&
    !project.declares(call.name)
    ? { subject: call.name, basis: 'it reads from standard input' }
    : undefined;
}

function repositoryCall(
  call: CoroutineCall,
  resolver: BlockingResolver,
  project: BlockingProject,
): BlockingClassification | undefined {
  if (call.receiverType === undefined || call.qualifier === undefined) {
    return undefined;
  }
  const type = lastSegment(call.receiverType);
  return project.isBlockingRepository(resolver, call.receiverType) &&
    !project.nonBlocking.has(call.name)
    ? { subject: `${type}.${call.name}`, basis: `${type} is a blocking Spring Data repository` }
    : undefined;
}

export function classifyBlocking(
  call: CoroutineCall,
  resolver: BlockingResolver,
  project: BlockingProject,
): BlockingClassification | undefined {
  return (
    staticCall(call, resolver) ??
    memberCall(call, resolver) ??
    evidenceCall(call, resolver) ??
    standardInput(call, project) ??
    repositoryCall(call, resolver, project)
  );
}
