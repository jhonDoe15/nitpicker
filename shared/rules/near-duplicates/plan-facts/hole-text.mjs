function holeValue(node) {
  if (node.kind === 'none') {
    return undefined;
  }
  if (node.kind === 'literal' || node.kind === 'type') {
    return node.value;
  }
  return node.text ?? (node.kind === 'name' ? node.value : undefined);
}

function oriented(parameter, side) {
  return side === 0 ? [parameter.a, parameter.b] : [parameter.b, parameter.a];
}

export function parameterFacts(parameters, side) {
  return parameters.map((parameter) => {
    const nodes = oriented(parameter, side);
    return {
      kind: parameter.kind,
      deferred: parameter.deferred === true,
      literal: nodes[0].literal ?? nodes[1].literal,
      values: nodes.map(holeValue),
      lines: nodes.map((node) => node.start),
    };
  });
}
