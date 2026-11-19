import { useRef, useState } from 'react';

export function Counter({ items }) {
  const [count, setCount] = useState(0);
  const list = useRef(null);
  return (
    <ul ref={list} className="counter" data-total={count * items.length}>
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => setCount(count + 1)}>
            {item.label}
          </button>
          <img src="/icon.png" alt="" />
        </li>
      ))}
    </ul>
  );
}
