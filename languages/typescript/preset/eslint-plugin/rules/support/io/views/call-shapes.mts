export type LiteralArgument =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'function' }
  | { readonly type: 'object'; readonly keys: Set<string>; readonly text?: string | undefined }
  | { readonly type: 'other' };

export type CallArgument =
  | LiteralArgument
  | { readonly type: 'new'; readonly name: string; readonly input: LiteralArgument | undefined };

export type CallView<Root = unknown> = {
  readonly names: string[];
  readonly label: string;
  readonly method: string | undefined;
  readonly root: Root | undefined;
  readonly args: CallArgument[];
};

export type Link = { readonly name: string; readonly called: boolean };

export type Step<Node, Root> = {
  readonly name?: string;
  readonly next?: Node;
  readonly called?: true;
  readonly root?: Root;
};

export type Child<Node> = { readonly key?: string | undefined; readonly value: Node | undefined };

export const SPREAD = '...';

export const TEXT_KEYS: ReadonlySet<string> = new Set(['text', 'sql']);

function linksLabel(links: readonly Link[]): string {
  return `${links.map(({ name, called }) => (called ? `${name}()` : name)).join('.')}()`;
}

export function viewOf<Root>(
  links: readonly Link[],
  root: Root | undefined,
  args: CallArgument[],
): CallView<Root> {
  return {
    names: links.map(({ name }) => name).filter((name) => name !== 'this'),
    label: linksLabel(links),
    method: links.at(-1)?.name,
    root,
    args,
  };
}

function isCalledLink<Node, Root>(steps: readonly Step<Node, Root>[], index: number): boolean {
  const previous = steps.slice(0, index).findLast((step) => step.name !== undefined || step.called);
  return previous?.called === true;
}

export function chainLinks<Node, Root>(
  callee: Node,
  step: (node: Node) => Step<Node, Root>,
): { readonly links: Link[]; readonly root: Root | undefined } {
  const steps: Step<Node, Root>[] = [];
  const pending = [callee];
  for (const node of pending) {
    const current = step(node);
    steps.push(current);
    if (current.next !== undefined) {
      pending.push(current.next);
    }
  }
  const links = steps.flatMap((current, index) =>
    current.name === undefined ? [] : [{ name: current.name, called: isCalledLink(steps, index) }],
  );
  return {
    links: links.toReversed(),
    root: steps.find((current) => current.root !== undefined)?.root,
  };
}

function addKeys<Node>(keys: Set<string>, entries: readonly Child<Node>[]): void {
  for (const { key } of entries) {
    if (key !== undefined) {
      keys.add(key);
    }
  }
}

export function deepKeys<Node>(root: Node, children: (node: Node) => Child<Node>[]): Set<string> {
  const keys = new Set<string>();
  const pending = [root];
  for (const node of pending) {
    const entries = children(node);
    addKeys(keys, entries);
    pending.push(...entries.flatMap(({ value }) => (value === undefined ? [] : [value])));
  }
  return keys;
}
