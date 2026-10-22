import {
  featureRoleContract,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { inModule } from '../../builds/module-path.mjs';

export const CONTRACT_RULE = 'contract-infrastructure-type';
const PACKAGE_FACE = 'package';

const FACES = {
  service: 'service',
  controller: 'controller',
  feature: "feature's public class",
  package: "feature's public class",
};

const KINDS = {
  persistence: ({ owner, type, face }) =>
    `Return a record (DTO) or a domain type from ${owner} and take plain values: ${type} is a persistence handle, so every caller of this ${face} depends on the database session. Keep ${type} inside the repository or adapter that owns the transaction.`,
  transport: ({ owner, type, face }) =>
    `Take plain values and return a record (DTO) or a domain type in ${owner}: ${type} is a web request or response object, so every caller of this ${face} needs a live HTTP exchange. Read it in the controller or adapter and pass the values in.`,
};

export function simpleName(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

function parse(detail) {
  const [face, kind, signature] = detail.split('|');
  const separator = signature.lastIndexOf(':');
  return {
    face,
    kind,
    method: signature.slice(0, separator),
    type: signature.slice(separator + 1),
  };
}

export function contractEntry(className, detail) {
  const { face, kind, method, type } = parse(detail);
  const describe = KINDS[kind];
  if (describe === undefined || FACES[face] === undefined) {
    throw new Error(`Unknown ${CONTRACT_RULE} detail ${detail}`);
  }
  const simple = simpleName(className);
  return {
    key: `${simple}|${method}:${simpleName(type)}`,
    symbol: simple,
    message: describe({ owner: `${simple}.${method}`, type: simpleName(type), face: FACES[face] }),
  };
}

export function featureFaceMatcher({ layout, modulePath }) {
  const roleOf = featureRoleContract(layout, PUBLIC_FACES.jvm);
  return (file) => {
    const role = roleOf(inModule(modulePath, file));
    return role.kind === 'feature' && role.isPublic;
  };
}

export function keepsContract(detail, file, isFeatureFace) {
  return parse(detail).face !== PACKAGE_FACE || isFeatureFace(file);
}
