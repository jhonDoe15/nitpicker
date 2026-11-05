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
    'type Options = { field?: string; fields?: string[] };',
    'export type Result = { error?: string; errors?: string[] };',
    'export function send(recipient: string, recipients: string[]) {}',
    'export function send(recipient?: string, recipients?: number[]) {}',
    'export function send(recipient?: string, ...recipients: string[]) {}',
    'export function send(recipient = "", recipients: string[] = []) {}',
    'function send(recipient?: string, recipients?: string[]) {}',
    'export function contains(role: string, roles: readonly string[] = []) {}',
    'export class Mailer { private send(recipient?: string, recipients?: string[]) {} }',
    'export class Mailer { protected send(recipient?: string, recipients?: string[]) {} }',
    'export class Mailer { #send(recipient?: string, recipients?: string[]) {} }',
    'export class Mailer extends Base { override send(recipient?: string, recipients?: string[]) {} }',
    'class Mailer { send(recipient?: string, recipients?: string[]) {} }',
    'export const send = items.map((item?: string, items?: string[]) => item);',
    'export * from "./mail";',
    'export { send } from "./mail";',
    "import { z } from 'zod'; export const Query = z.object({ tag: z.string(), tags: z.array(z.string()) });",
    "import { z } from 'zod'; export const Query = z.object({ tag: z.string().optional(), tags: z.array(z.number()).optional() });",
    "import { z } from 'zod'; export const Query = z.object({ tag: z.string().optional(), tags: z.array(z.string().optional()).optional() });",
    "import { z } from './schema'; export const Query = z.object({ tag: z.string().optional(), tags: z.array(z.string()).optional() });",
    'export const Query = z.object({ tag: z.string().optional(), tags: z.array(z.string()).optional() });',
    "import { z } from 'zod'; export const Query = z.object({ [tag]: z.string().optional(), tags: z.array(z.string()).optional() });",
    "import * as v from 'valibot'; export const Query = v.object({ tag: v.string(), tags: v.optional(v.array(v.string())) });",
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
    {
      code: 'export type Options = { field?: string; fields?: string[] };',
      errors: [pair('field', 'fields')],
    },
    {
      code: 'export type SearchOptions = { tag?: string | undefined; tags?: string[] | null | undefined };',
      errors: [pair('tag', 'tags')],
    },
    {
      code: 'export interface SearchRequest { child?: Node; children?: Node[] }',
      errors: [pair('child', 'children')],
    },
    {
      code: 'export function send(recipient?: string, recipients?: string[]) {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'export function send(recipient: string = "", recipients: readonly string[] = []) {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'export const send = (selectedPerson?: User, selectedPeople?: Array<User>) => undefined;',
      errors: [pair('selectedPerson', 'selectedPeople')],
    },
    {
      code: 'function send(recipient?: string, recipients?: string[]) {} export { send };',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'const send = (recipient?: string, recipients?: string[]) => 1; export default send;',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'export default function send(recipient?: string, recipients?: string[]) {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'export function send(recipient?: string): void; export function send(recipient?: string, recipients?: string[]): void; export function send() {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'export class Mailer { constructor(private readonly recipient?: string, private readonly recipients?: string[]) {} send(tag?: string, tags?: string[]) {} static of(id?: number, ids?: number[]) {} }',
      errors: [pair('recipient', 'recipients'), pair('tag', 'tags'), pair('id', 'ids')],
    },
    {
      code: 'export function send(options: { recipient?: string; recipients?: string[] }) {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'interface SendOptions { recipient?: string; recipients?: string[] } export async function send(body: string, { recipient }: SendOptions = {}) {}',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: 'type Base = { recipient?: string }; type SendOptions = Base & { recipients?: string[] }; export const send = (options?: SendOptions) => options;',
      errors: [pair('recipient', 'recipients')],
    },
    {
      code: "import { z } from 'zod'; export const Query = z.object({ tag: z.string().optional(), tags: z.array(z.string()).optional() });",
      errors: [pair('tag', 'tags')],
    },
    {
      code: "import { z as schema } from 'zod/v4'; const Query = schema.strictObject({ tag: schema.string().nullish(), tags: schema.string().array().default([]) });",
      errors: [pair('tag', 'tags')],
    },
    {
      code: "import * as z from 'zod'; const Query = z.object({ category: z.optional(z.enum(['a', 'b'])), categories: z.array(z.enum(['a', 'b'])).min(1).optional().describe('x') });",
      errors: [pair('category', 'categories')],
    },
    {
      code: "import * as z from 'zod'; const Query = z.object({ category: z.optional(z.enum(['a', 'b'])), categories: z.optional(z.array(z.enum(['a', 'b']))).describe('x') });",
      errors: [pair('category', 'categories')],
    },
    {
      code: "import * as v from 'valibot'; export const Query = v.object({ tag: v.optional(v.string()), tags: v.optional(v.pipe(v.array(v.string()), v.minLength(1))) });",
      errors: [pair('tag', 'tags')],
    },
    {
      code: "import { object, optional, array, string } from 'superstruct'; export const Query = object({ tag: optional(string()), tags: optional(array(string())) });",
      errors: [pair('tag', 'tags')],
    },
    {
      code: "import { Type } from '@sinclair/typebox'; export const Query = Type.Object({ tag: Type.Optional(Type.String()), tags: Type.Optional(Type.Array(Type.String())) });",
      errors: [pair('tag', 'tags')],
    },
  ].map((testCase) => ({ filename, ...testCase })),
});
