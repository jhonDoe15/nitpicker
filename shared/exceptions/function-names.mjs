const LAMBDA = /^lambda\$(.+)\$\d+$/u;

/** `Calc.save` for the PIT mutant symbol `demo.Calc#save(IIII)I`, `Calc.Calc` for a constructor. */
export function pitFunctionName(symbol) {
  const separator = symbol.indexOf('#');
  if (separator === -1) {
    return undefined;
  }
  const className = symbol.slice(symbol.slice(0, separator).lastIndexOf('.') + 1, separator);
  const classNames = className.split('$');
  const method = symbol.slice(separator + 1).replace(/\(.*$/su, '');
  const name = method === '<init>' ? classNames.at(-1) : (LAMBDA.exec(method)?.[1] ?? method);
  return [...classNames, name === 'new' ? classNames.at(-1) : name].join('.');
}

/** The name of the function a finding is about, as an `exceptions` entry's `function` writes it. */
export function functionNameOf(finding) {
  if (typeof finding.symbol !== 'string' || finding.symbol === '') {
    return undefined;
  }
  return finding.tool === 'pit' ? pitFunctionName(finding.symbol) : finding.symbol;
}
