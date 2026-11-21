import { unusedDirectiveMessage, unusedRuleIds } from "../../eslint/merge/directive-messages.mjs";
const UNUSED_DIRECTIVE = 'Unused eslint-disable directive';
function isUnusedDirective(message) {
    return message.ruleId === undefined && message.message.startsWith(UNUSED_DIRECTIVE);
}
function positionKey({ filePath }, { line, column }) {
    return JSON.stringify([filePath, line, column]);
}
function unusedByPosition(results) {
    return new Map(results.flatMap((result) => result.messages
        .filter((message) => isUnusedDirective(message))
        .map((message) => [positionKey(result, message), message])));
}
function sharedUnused(message, other) {
    if (other === undefined) {
        return undefined;
    }
    const rules = unusedRuleIds(message.message);
    const otherRules = new Set(unusedRuleIds(other.message));
    if (rules.length === 0 && otherRules.size === 0) {
        return message;
    }
    const shared = rules.filter((rule) => otherRules.has(rule));
    return shared.length === 0 ? undefined : { ...message, message: unusedDirectiveMessage(shared) };
}
export function mergedPassResults(passes) {
    const typed = passes.filter(({ typeAware }) => typeAware).flatMap(({ results }) => results);
    const plain = passes.filter(({ typeAware }) => !typeAware).flatMap(({ results }) => results);
    if (typed.length === 0) {
        return plain;
    }
    const typedUnused = unusedByPosition(typed);
    function kept(result, others) {
        return {
            ...result,
            messages: result.messages.flatMap((message) => {
                if (!isUnusedDirective(message)) {
                    return [message];
                }
                const merged = sharedUnused(message, others.get(positionKey(result, message)));
                return merged === undefined ? [] : [merged];
            }),
        };
    }
    return [
        ...plain.map((result) => kept(result, typedUnused)),
        ...typed.map((result) => ({
            ...result,
            messages: result.messages.filter((message) => !isUnusedDirective(message)),
        })),
    ];
}
