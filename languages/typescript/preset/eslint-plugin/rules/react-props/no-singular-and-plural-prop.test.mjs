import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-singular-and-plural-prop.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/ui/panel.tsx';

function pair(singular, plural) {
  return { messageId: 'singularAndPlural', data: { singular, plural } };
}

tester.run('no-singular-and-plural-prop', rule, {
  valid: [
    'function Panel({ fields }: { fields?: string[] }) { return <div />; }',
    'type PanelProps = { fields: string[] }; function Panel(props: PanelProps) { return <div />; }',
    'type Props = { field?: string; fields?: string[] }; export const size = 1;',
    'export type Options = { field?: string; fields?: string[] };',
    'export type PanelProps = { field: string } | { fields: string[] };',
    'export type PanelProps = { field?: string } | { fields?: string[] };',
    'export type PanelProps = { field: string; fields?: never } | { fields: string[]; field?: never };',
    'export type PanelProps = { item: Item; items: Item[] };',
    'export type ListProps = { selected: Item; selecteds: Item[] };',
    'export type ListProps = { item?: Item; items: Item[] };',
    'export type ListProps = { item: Item; items?: Item[] };',
    'export type ListProps = { item?: Item; items?: Row[] };',
    'export type ListProps = { error?: string; errors?: Record<string, string> };',
    'export type ListProps = { item?: Item; items?: Set<Item> };',
    'export type ListProps = { item?: Item; items?: Array };',
    'export type ListProps = { item?: Item; items?: Array<Row> };',
    'export type PanelProps = { keys?: string[]; label?: string };',
    'export type PanelProps = { data?: string; datum?: string };',
    'export type PanelProps = { onSelect?(): void; onSelects?: (() => void)[] };',
    'function helper(options: { field?: string; fields?: string[] }) { return options; }',
    'function panel(props: { field?: string; fields?: string[] }) { return <div />; }',
    'function Panel(props: { field?: string; fields?: string[] }) { return 1; }',
    'function Panel(props) { return <div />; }',
    'export type PanelProps = Omit<Base, "id"> & { fields?: string[] };',
    'type A = A & { field?: string }; function Panel(props: A) { return <div />; }',
    'export type PanelProps = { [key: string]: string; keys?: string[] };',
    'export type PanelProps = { [`field`]?: string; fields?: string[] };',
    'export interface PanelProps extends Base { fields?: string[] }',
    'function Panel(props: Missing.Props) { return <div />; }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'function Panel(props: { field?: string; fields?: string[] }) { return <div />; }',
      errors: [pair('field', 'fields')],
    },
    {
      code: 'const Panel = ({ item, items }: { item?: Item; items?: Item[] }) => <div />;',
      errors: [pair('item', 'items')],
    },
    {
      code: 'function Panel(props: PanelProps) { return <div />; } type PanelProps = { field?: string; fields?: string[] };',
      errors: [pair('field', 'fields')],
    },
    {
      code: 'export type CardProps = { category?: string; categories?: string[] };',
      errors: [pair('category', 'categories')],
    },
    {
      code: 'export interface BoxProps { box?: string; boxes?: string[] }',
      errors: [pair('box', 'boxes')],
    },
    {
      code: 'export type CardProps = { tag?: string; tags?: readonly string[] };',
      errors: [pair('tag', 'tags')],
    },
    {
      code: 'export type CardProps = { tag?: string; tags?: ReadonlyArray<string> };',
      errors: [pair('tag', 'tags')],
    },
    {
      code: 'export type CardProps = { tag?: string; tags?: Array<string> };',
      errors: [pair('tag', 'tags')],
    },
    {
      code: 'type Base = { tag?: string }; type Props = Base & { tags?: string[] }; export const Panel = (props: Props) => <div />;',
      errors: [pair('tag', 'tags')],
    },
    {
      code: 'const Panel: FC<PanelProps> = () => <div />; type PanelProps = { id?: string; ids?: string[] };',
      errors: [pair('id', 'ids')],
    },
    {
      code: 'const Panel: React.FC<{ id?: string; ids?: string[] }> = () => <div />;',
      errors: [pair('id', 'ids')],
    },
    {
      code: 'const Panel = memo(function Panel(props: { id?: string; ids?: string[] }) { return <div />; });',
      errors: [pair('id', 'ids')],
    },
    {
      code: 'const Panel = React.forwardRef((props: { id?: string; ids?: string[] }, ref) => <div ref={ref} />);',
      errors: [pair('id', 'ids')],
    },
    {
      code: "export type PanelProps = { 'field'?: string; 'fields'?: string[] };",
      errors: [pair('field', 'fields')],
    },
    {
      code: 'export type PanelProps = { a?: 1; as?: 1[]; b?: 2; bs?: 2[] };',
      errors: [pair('a', 'as'), pair('b', 'bs')],
    },
    {
      code: 'type Props = { field?: string; fields?: string[] }; export const A = (p: Props) => <i />; export const B = (p: Props) => <b />; export type BProps = Props;',
      errors: [pair('field', 'fields')],
    },
  ].map((testCase) => ({ filename, ...testCase })),
});
