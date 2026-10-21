export const FORWARDING_RULE = 'no-forwarding-wrapper';

function underRoot(file, roots) {
  return roots.some((root) => {
    const normalized = root.replace(/\/$/u, '');
    return normalized === '' || normalized === '.' || file.startsWith(`${normalized}/`);
  });
}

export function forwardingFindings(metrics, manifest) {
  const main = manifest.kotlinSourceRoots ?? [];
  const tests = manifest.kotlinTestSourceRoots ?? [];
  return (metrics.forwarders ?? [])
    .filter(({ file }) => underRoot(file, main) && !underRoot(file, tests))
    .map(({ file, name, target, line }) => ({
      tool: 'detekt',
      rule: FORWARDING_RULE,
      path: file,
      identity: `forward:${name}:${target}`,
      symbol: name,
      location: { line },
      message:
        `${name} only forwards unchanged arguments to the directly accessible top-level function ${target} in ${file}, with the same parameter names, types and return type. ` +
        `Call ${target} directly and remove ${name}; keep a wrapper when it adds policy or adapts the contract. ` +
        `For a required compatibility boundary, add an "exceptions" entry for rule ${FORWARDING_RULE} with reviewed paths and a reason in nitpicker.config.json.`,
      classification: 'enforceable',
    }));
}
