import { applyFindingExceptions as untypedApplyFindingExceptions } from '../../shared/exceptions/finding-exceptions.mjs';
import { withCanonicalRules as untypedWithCanonicalRules } from '../../shared/exceptions/validation.mjs';
import { applyPythonExceptions as untypedApplyPythonExceptions } from '../../languages/python/adapters/configuration/python-exceptions.mjs';
import { routeFields as untypedRouteFields } from '../../shared/messages/exception-sentence.mjs';

export type Route = { entry: unknown; key: string | undefined };
export type Finding = Readonly<Record<string, unknown>>;
type Fields = { exception?: object | undefined; exceptionList?: string | undefined };
type Canonical = { python: { exceptions: object[] }; exceptions: object[] };

export const applyFindingExceptions: (findings: Finding[], exceptions: object[]) => unknown[] =
  untypedApplyFindingExceptions;
export const applyPythonExceptions: (findings: Finding[], exceptions: object[]) => unknown[] =
  untypedApplyPythonExceptions;
export const withCanonicalRules: (config: object) => Canonical = untypedWithCanonicalRules;
export const routeFields: (message: string) => Fields = untypedRouteFields;
