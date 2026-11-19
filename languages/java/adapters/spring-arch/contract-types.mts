import {
  featureRoleContract,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { inModule } from '../../builds/module-path.mts';

export const CONTRACT_RULE = 'contract-infrastructure-type';
const PACKAGE_FACE = 'package';

const FACES: Readonly<Record<string, string | undefined>> = {
  service: 'service',
  controller: 'controller',
  feature: "feature's public class",
  package: "feature's public class",
};

type Description = { readonly owner: string; readonly type: string; readonly face: string };

const KINDS: Readonly<Record<string, ((description: Description) => string) | undefined>> = {
  persistence: ({ owner, type, face }: Description): string =>
    `Take a repository or a port interface and return a record (DTO) or a domain type from ${owner}: ${type} is a persistence handle, so every caller of this ${face} depends on the database session. Keep ${type} inside the repository or adapter that owns the transaction.`,
  transport: ({ owner, type, face }: Description): string =>
    `Take plain values and return a record (DTO) or a domain type in ${owner}: ${type} is a web request or response object, so every caller of this ${face} needs a live HTTP exchange. Read it in the controller or adapter and pass the values in.`,
};

export function simpleName(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1);
}

function parse(detail: string): { face: string; kind: string; method: string; type: string } {
  const [face = '', kind = '', signature = ''] = detail.split('|');
  const separator = signature.lastIndexOf(':');
  return {
    face,
    kind,
    method: signature.slice(0, separator),
    type: signature.slice(separator + 1),
  };
}

export function contractEntry(
  className: string,
  detail: string,
): { key: string; symbol: string; message: string } {
  const { face, kind, method, type } = parse(detail);
  const describe = KINDS[kind];
  const faceName = FACES[face];
  if (describe === undefined || faceName === undefined) {
    throw new Error(`Unknown ${CONTRACT_RULE} detail ${detail}`);
  }
  const simple = simpleName(className);
  return {
    key: `${simple}|${method}:${simpleName(type)}`,
    symbol: simple,
    message: describe({ owner: `${simple}.${method}`, type: simpleName(type), face: faceName }),
  };
}

type FeatureRole = { readonly kind: string; readonly isPublic: boolean };

const contractRoles: (layout: unknown, face: unknown) => (file: string) => FeatureRole =
  featureRoleContract;

export function featureFaceMatcher({
  layout,
  modulePath,
}: {
  layout: unknown;
  modulePath: string;
}): (file: string) => boolean {
  const roleOf = contractRoles(layout, PUBLIC_FACES.jvm);
  return (file: string): boolean => {
    const role = roleOf(inModule(modulePath, file));
    return role.kind === 'feature' && role.isPublic;
  };
}

export function keepsContract(
  detail: string,
  file: string,
  isFeatureFace: (file: string) => boolean,
): boolean {
  return parse(detail).face !== PACKAGE_FACE || isFeatureFace(file);
}
