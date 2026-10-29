import {
  EVERY,
  EVIDENCE_CALLS,
  MEMBER_CALLS,
  STANDARD_INPUT,
  STATIC_CALLS,
} from './blocking-catalog.mjs';

const TYPE_ALIASES = new Map([['java.nio.file.Path', ['kotlin.io.path.Path']]]);

function covers(names, name) {
  return names === EVERY || names.includes(name);
}

function simpleName(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

function isOneOf(resolver, name, qualified) {
  return [qualified, ...(TYPE_ALIASES.get(qualified) ?? [])].some((candidate) =>
    resolver.isType(name, candidate),
  );
}

function staticCall(call, resolver) {
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
        basis: `${simpleName(entry.owners[0])} is a blocking API`,
      };
    }
  }
  return undefined;
}

function memberCall(call, resolver) {
  const { receiverType } = call;
  if (receiverType === undefined || call.qualifier === undefined) {
    return undefined;
  }
  for (const entry of MEMBER_CALLS) {
    const matched = entry.types.find((type) => isOneOf(resolver, receiverType, type));
    if (
      matched !== undefined &&
      covers(entry.names, call.name) &&
      (entry.requires ?? []).every((prefix) => resolver.importsFrom(prefix))
    ) {
      return {
        subject: `${simpleName(matched)}.${call.name}`,
        basis: `the receiver is declared as ${matched}`,
      };
    }
  }
  return undefined;
}

function evidenceCall(call, resolver) {
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

function standardInput(call, project) {
  return call.qualifier === undefined &&
    call.arguments === 0 &&
    STANDARD_INPUT.includes(call.name) &&
    !project.declares(call.name)
    ? { subject: call.name, basis: 'it reads from standard input' }
    : undefined;
}

function repositoryCall(call, project) {
  if (call.receiverType === undefined || call.qualifier === undefined) {
    return undefined;
  }
  const type = simpleName(call.receiverType);
  return project.repositories.has(type) && !project.suspending.has(call.name)
    ? { subject: `${type}.${call.name}`, basis: `${type} is a blocking Spring Data repository` }
    : undefined;
}

export function classifyBlocking(call, resolver, project) {
  return (
    staticCall(call, resolver) ??
    memberCall(call, resolver) ??
    evidenceCall(call, resolver) ??
    standardInput(call, project) ??
    repositoryCall(call, project)
  );
}
