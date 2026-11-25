type Frames<Piece> = Iterator<Piece>[];

function topsOf<Frame>(stack: readonly Frame[]): Iterable<Frame> {
  return {
    [Symbol.iterator]: () => ({
      next: (): IteratorResult<Frame> => {
        const top = stack.at(-1);
        return top === undefined ? { done: true, value: undefined } : { done: false, value: top };
      },
    }),
  };
}

export function* flattened<Child>(
  root: Iterator<string | Child>,
  open: (child: Child) => Iterator<string | Child>,
): Generator<string> {
  const stack: Frames<string | Child> = [root];
  for (const top of topsOf(stack)) {
    const step = top.next();
    if (step.done === true) {
      stack.pop();
    } else if (typeof step.value === 'string') {
      yield step.value;
    } else {
      stack.push(open(step.value));
    }
  }
}
