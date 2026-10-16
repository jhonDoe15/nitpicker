import { describe, expect, it } from 'vitest';
import { exportedComponents } from './exported-components.mjs';

function names(code, fileName = 'src/widget.tsx') {
  return exportedComponents(code, fileName).map(({ name }) => name);
}

describe('exported components', () => {
  it('finds exported functions, arrows and function expressions that return JSX', () => {
    expect(names('export function Card() { return <div />; }')).toEqual(['Card']);
    expect(names('export const Card = () => <div />;')).toEqual(['Card']);
    expect(names('export const Card = function () { return <div />; };')).toEqual(['Card']);
    expect(names('export const Card = () => (<><b /></>);')).toEqual(['Card']);
    expect(names('export const Card = ({ a }) => a ? <b /> : null;')).toEqual(['Card']);
    expect(names('export const Card = ({ a }) => a && <b />;')).toEqual(['Card']);
    expect(names('export function Card({ a }) { if (a) { return null; } return <b />; }')).toEqual([
      'Card',
    ]);
  });

  it('finds memo and forwardRef results and class components', () => {
    expect(names('export const Card = memo(() => <div />);')).toEqual(['Card']);
    expect(
      names('export const Card = React.forwardRef((props, ref) => <div ref={ref} />);'),
    ).toEqual(['Card']);
    expect(names('export const Card = memo(forwardRef(Inner));')).toEqual(['Card']);
    expect(
      names('export class Card extends React.Component { render() { return <b />; } }'),
    ).toEqual(['Card']);
    expect(names('export class Card extends PureComponent { render() { return <b />; } }')).toEqual(
      ['Card'],
    );
  });

  it('finds components exported by name, by default and through a list', () => {
    expect(names('function Card() { return <b />; }\nexport { Card };')).toEqual(['Card']);
    expect(names('function Card() { return <b />; }\nexport default Card;')).toEqual(['Card']);
    expect(names('const Card = () => <b />;\nexport default memo(Card);')).toEqual(['Card']);
    expect(names('export default function Card() { return <b />; }')).toEqual(['Card']);
    expect(names('export default () => <b />;')).toEqual(['default']);
    expect(names('export default memo(() => <b />);')).toEqual(['default']);
    expect(names('const A = () => <a />;\nconst B = () => <b />;\nexport { B, A };')).toEqual([
      'A',
      'B',
    ]);
  });

  it('does not count objects, arrays, tables, helpers and values that only contain JSX', () => {
    expect(names('export const ICONS = { a: <svg />, b: <svg /> };')).toEqual([]);
    expect(names('export const Icons = [<a />, <b />];')).toEqual([]);
    expect(names('export const Element = <div />;')).toEqual([]);
    expect(names('export const ROUTES = { home: () => <Home /> };')).toEqual([]);
    expect(names('export function renderRow() { return <tr />; }')).toEqual([]);
    expect(names('export const Format = (value) => value.toFixed(2);')).toEqual([]);
    expect(names('export function Parse() { return () => <div />; }')).toEqual([]);
    expect(names('export class Store { render() { return <b />; } }')).toEqual([]);
    expect(names('function Card() { return <b />; }')).toEqual([]);
    expect(names('export type Card = { a: 1 };')).toEqual([]);
    expect(names('export { Card } from "./card";')).toEqual([]);
  });

  it('locates each component at its declaration', () => {
    const code = [
      'import { memo } from "react";',
      'export const Card = () => <div />;',
      'function Row() { return <tr />; }',
      'export { Row };',
      'export default memo(() => <b />);',
    ].join('\n');
    expect(exportedComponents(code, 'src/card.tsx')).toEqual([
      { name: 'Card', line: 2 },
      { name: 'Row', line: 3 },
      { name: 'default', line: 5 },
    ]);
  });

  it('reads JavaScript files with JSX', () => {
    expect(names('export const Card = () => <div />;', 'src/card.jsx')).toEqual(['Card']);
    expect(names('export function Card() { return <div />; }', 'src/card.js')).toEqual(['Card']);
    expect(names('export function Card() { return <div />; }', 'src/card.mjs')).toEqual(['Card']);
  });
});
