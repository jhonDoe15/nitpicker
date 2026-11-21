import * as React from 'react';

type Props = { readonly items: readonly string[]; readonly onPick: (item: string) => void };

export const List = React.memo(function List({ items, onPick }: Props) {
  const sorted = React.useMemo(() => [...items].sort((left, right) => left.localeCompare(right)), [items]);
  React.useEffect(() => {
    const timer = setTimeout(() => onPick(sorted[0]!), 10);
    return () => clearTimeout(timer);
  }, [sorted, onPick]);
  return (
    <ul className="list" {...{ role: 'list' }}>
      {sorted.map((item) => (
        <li key={item} onClick={() => onPick(item)} data-x={(() => item)()}>
          {item}
          <button onClick={function () { onPick(item); }} />
        </li>
      ))}
      <>
        {sorted.length > 0 ? <span>{() => 1}</span> : null}
      </>
    </ul>
  );
});

export default () => <List items={[]} onPick={() => undefined} />;

export function Generic<T,>({ value }: { value: T }) {
  return <div>{String(value)}</div>;
}
