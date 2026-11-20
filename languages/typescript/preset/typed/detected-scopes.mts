import {
  frameworkConventions,
  hasScopePackage,
  reactMajorOf,
  scopePackage,
} from '../eslint-config/scope-support.mts';
import { stylingApproachFor } from '../eslint-config/react/react-styling.mts';
import { resolveLayoutFor } from '../layout.mts';
import { markedGeneratedFiles } from '../layout/generated-files.mts';
import type { HeadPolicyFile, ScopeSettings } from './head-policy-types.mts';

type Fields = Readonly<Record<string, unknown>>;

export function withDetectedScopes(policy: HeadPolicyFile, projectRoot: string): Fields {
  const generatedFiles = markedGeneratedFiles(projectRoot);
  return { generatedFiles, ...detectedScopes({ ...policy, generatedFiles }, projectRoot) };
}

function detectedScope(
  policy: HeadPolicyFile,
  projectRoot: string,
  scope: 'react' | 'i18n',
): ScopeSettings & { enabled: unknown } {
  return {
    ...policy[scope],
    enabled: policy[scope]?.enabled ?? hasScopePackage(projectRoot, scope),
  };
}

function detectedScopes(policy: HeadPolicyFile, projectRoot: string): Fields {
  const scopes = {
    react: detectedScope(policy, projectRoot, 'react'),
    i18n: detectedScope(policy, projectRoot, 'i18n'),
  };
  const iconPackage = scopePackage(projectRoot, 'icons');
  const major = scopes.react.enabled ? reactMajorOf(projectRoot) : undefined;
  const styling = scopes.react.enabled
    ? stylingApproachFor({ projectRoot, react: scopes.react, layout: resolveLayoutFor(policy) })
    : undefined;
  const frameworks = frameworkConventions(projectRoot);
  const detected = frameworks.defaultExports.length + frameworks.entryPoints.length > 0;
  return {
    ...scopes,
    ...(detected ? { frameworks } : {}),
    react: {
      ...scopes.react,
      ...(iconPackage === undefined ? {} : { iconPackage }),
      ...(major === undefined ? {} : { major }),
      ...(styling === undefined ? {} : { styling }),
    },
  };
}
