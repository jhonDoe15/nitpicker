export function mergeResults(results) {
    const byFile = new Map();
    for (const result of results) {
        byFile.set(result.filePath, [...(byFile.get(result.filePath) ?? []), ...result.messages]);
    }
    return [...byFile]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([filePath, messages]) => ({ filePath, messages: messages.sort(byPosition) }));
}
function byPosition(left, right) {
    return (left.line - right.line ||
        left.column - right.column ||
        String(left.ruleId).localeCompare(String(right.ruleId)) ||
        left.message.localeCompare(right.message));
}
