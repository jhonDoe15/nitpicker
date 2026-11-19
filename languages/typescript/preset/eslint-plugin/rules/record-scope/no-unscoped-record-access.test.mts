import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { rule } from './no-unscoped-record-access.mts';

const STORE = [
  'export declare class Repo {',
  '  findOne(filter: object): Promise<any>;',
  '  update(filter: object, data?: object): Promise<any>;',
  '  delete(filter: object): Promise<any>;',
  '}',
  'export declare const messageRepository: Repo;',
  'export declare const noteRepository: Repo;',
  'export declare const prisma: { booking: { findFirst(args: object): Promise<any>; update(args: object): Promise<any> } };',
  'export declare function doesUserHaveAccess(userId: string, id: string): Promise<boolean>;',
  'export interface Command { notificationId: string; environmentId: string; subscriberId: string }',
].join('\n');

const COPIES = Array.from({ length: 40 }, (_, index) => String(index));
const CONVENTIONS = [
  "import { messageRepository, noteRepository, prisma } from './store';",
  ...COPIES.map(
    (n) =>
      `export const m${n} = (e: string, s: string, i: string) => messageRepository.findOne({ _environmentId: e, _subscriberId: s, _id: i });`,
  ),
  ...COPIES.map((n) => `export const n${n} = (i: string) => noteRepository.findOne({ _id: i });`),
  ...COPIES.map(
    (n) =>
      `export const b${n} = (u: string, i: string) => prisma.booking.findFirst({ where: { id: i, userId: u } });`,
  ),
].join('\n');

const { tester, typed } = typedIoProject('record-scope', STORE, { 'conventions.ts': CONVENTIONS });
const HEADER =
  "import { messageRepository, noteRepository, prisma, doesUserHaveAccess, Command, Repo } from './store';\n";

function body(code: string) {
  return typed(`${HEADER}${code}`);
}

tester.run('no-unscoped-record-access', rule, {
  valid: [
    'export function f(c: Command) { return messageRepository.findOne({ _environmentId: c.environmentId, _subscriberId: c.subscriberId, _id: c.notificationId }); }',
    'export function f(c: Command, s: string) { return messageRepository.findOne({ _subscriberId: s, _id: c.notificationId, _environmentId: c.environmentId }); }',
    'export function f(c: Command) { return noteRepository.findOne({ _id: c.notificationId }); }',
    'export function f(id: string) { return messageRepository.findOne({ _id: id }); }',
    'export function f(c: Command) { const own = "x"; return messageRepository.findOne({ _id: own }); }',
    'export function f(c: Command) { return messageRepository.findOne({ ...c, _id: c.notificationId }); }',
    'export function f(c: Command) { return messageRepository.findOne({ OR: [{ _id: c.notificationId }] }); }',
    'export function f(c: Command) { return messageRepository.findOne({ email: c.subscriberId }); }',
    'export async function f(c: Command) { await doesUserHaveAccess(c.subscriberId, c.notificationId); return messageRepository.findOne({ _id: c.notificationId }); }',
    'export async function f(c: Command, user: { organizationId: string }) { const m = await messageRepository.findOne({ _id: c.notificationId }); if (m.organizationId !== user.organizationId) throw new Error("no"); return m; }',
    'export async function adminFind(c: Command) { return messageRepository.findOne({ _id: c.notificationId }); }',
    'export class Notes { constructor(private messageRepository: Repo) {} find(c: Command) { return this.messageRepository.findOne({ _environmentId: c.environmentId, _subscriberId: c.subscriberId, _id: c.notificationId }); } }',
    'export class AdminController { find(c: Command) { return messageRepository.findOne({ _id: c.notificationId }); } }',
    'export function f(u: string, i: string) { return prisma.booking.findFirst({ where: { id: i, userId: u } }); }',
    'export function f(input: { id: string }, u: string) { return prisma.booking.findFirst({ where: { id: input.id, userId: u } }); }',
    'export function f(input: { id: string }) { return prisma.booking.findFirst({ select: { id: true }, orderBy: { id: "asc" } }); }',
  ].map(body),
  invalid: [
    {
      code: 'export function f(c: Command) { return messageRepository.findOne({ _environmentId: c.environmentId, _id: c.notificationId }); }',
    },
    {
      code: 'export function f(c: Command) { return messageRepository.update({ _id: c.notificationId }, { read: true }); }',
    },
    {
      code: 'export async function f(input: { id: string }) { return prisma.booking.update({ where: { id: input.id }, data: {} }); }',
    },
    {
      code: 'export async function f(req: { params: { id: string } }) { const { id } = req.params; return prisma.booking.findFirst({ where: { id } }); }',
    },
    {
      code: 'export async function f({ input }: { input: { bookingId: string } }) { return prisma.booking.findFirst({ where: { id: input.bookingId } }); }',
    },
    {
      code: 'export class Snooze { constructor(private messageRepository: Repo) {} find(command: Command) { return this.messageRepository.findOne({ _environmentId: command.environmentId, channel: "in_app", _id: command.notificationId }); } }',
    },
    {
      code: 'export async function f(c: Command) { const id = String(c.notificationId); return messageRepository.delete({ _environmentId: c.environmentId, _id: id }); }',
    },
  ].map(({ code }) => ({
    ...body(code),
    errors: [{ messageId: 'unscoped' as const }],
  })),
});
