import React, { memo, forwardRef } from 'react';
import * as Icons from './icons';

type Props<T> = { items: T[]; render?: (item: T) => React.ReactNode };

export function List<T>({ items, render }: Props<T>) {
  return (
    <ul className="list" data-count={items.length} xlink:href="#">
      {items.map((item) => <li key={String(item)}>{render?.(item)} text  with
        spaces </li>)}
      <Icons.Close<T> size={12} />
      <svg:rect />
      <></>
    </ul>
  );
}

export const Card = memo(function Card({ title }: { title: string }) {
  return <div title={title}><List items={[title]} /></div>;
});

export const Field = React.forwardRef<HTMLInputElement, Props<string>>((props, ref) => <input ref={ref} {...props} />);
const Plain = () => <List<string> items={[]} />;
export default Plain;
export const Spaced = () => <a>xy﻿z  w</a>;
