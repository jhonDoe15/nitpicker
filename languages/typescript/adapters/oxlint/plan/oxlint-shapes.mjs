import { fieldOf } from "../../../../../shared/values/readers.mjs";
import { hasFields } from "../../../preset/eslint-config/runner/node-test-plugin.mjs";
function isPlan(value) {
    return hasFields(value, ['groups', 'noInlineConfig', 'typedPluginRules', 'nativeRules']);
}
function isDiagnostic(value) {
    return hasFields(value, ['filename', 'message']);
}
function isLintResult(value) {
    return hasFields(value, ['filePath', 'messages']);
}
export function planOf(value) {
    if (!isPlan(value)) {
        throw new TypeError('oxlint planning did not report a lint plan');
    }
    return value;
}
export function diagnosticsOf(report) {
    const diagnostics = fieldOf(report, 'diagnostics');
    if (!(Array.isArray(diagnostics) && diagnostics.every(isDiagnostic))) {
        throw new TypeError('oxlint did not report its diagnostics');
    }
    return diagnostics;
}
export function lintResultsOf(value) {
    if (!(Array.isArray(value) && value.every(isLintResult))) {
        throw new TypeError('ESLint did not report lint results');
    }
    return value;
}
