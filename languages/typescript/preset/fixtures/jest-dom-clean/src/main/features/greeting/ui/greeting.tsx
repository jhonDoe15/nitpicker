import type { ReactElement } from 'react';
import { describeResult, greet } from '../domain/greet';

export function Greeting({ name }: { readonly name: string }): ReactElement {
  return <p>{describeResult(greet(name))}</p>;
}
