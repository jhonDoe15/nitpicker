import type { FlowModel, FunctionModel } from './syntax-types.mts';

export function functionNamed(model: FlowModel, name: string): FunctionModel {
  const fn = model.functions[name];
  if (fn === undefined) {
    throw new Error(`flow-model: no model for function ${name}`);
  }
  return fn;
}
