export const UNUSED_PARAMETER_ADVICE = 'Remove the parameter and update the callers.';

export const UNUSED_PARAMETER_HINT = ` ${UNUSED_PARAMETER_ADVICE} Drop a destructured property from the pattern, or rename it \`{ total: _total }\`. A parameter that an override or a callback signature requires starts with \`_\` (\`_context\`); that includes one whose position matters, such as the \`_req\` of an Express error handler.`;

export function isUnusedParameterFinding(finding) {
  return finding?.message?.includes(UNUSED_PARAMETER_ADVICE) === true;
}
