function promise(type) {
  return `Promise<${type}>`;
}

const TYPEORM = [
  'export type FindManyOptions = { where?: object; relations?: string[] | Record<string, boolean> };',
  'export declare class SelectQueryBuilder<T> {',
  '  leftJoinAndSelect(property: string, alias: string): this;',
  '  innerJoinAndSelect(property: string, alias: string): this;',
  '  where(condition: string, values?: object): this;',
  `  getMany(): ${promise('T[]')};`,
  '}',
  'export declare class Repository<T> {',
  `  find(options?: FindManyOptions): ${promise('T[]')};`,
  `  findBy(where: object): ${promise('T[]')};`,
  `  findOneBy(where: object): ${promise('T | null')};`,
  `  save<E>(entity: E): ${promise('E')};`,
  '  create(entity?: object): T;',
  '  createQueryBuilder(alias: string): SelectQueryBuilder<T>;',
  '}',
  'export declare class EntityManager {',
  `  save<E>(entity: E): ${promise('E')};`,
  '  getRepository<T>(target: new () => T): Repository<T>;',
  '}',
  'export declare class QueryRunner {',
  '  manager: EntityManager;',
  `  startTransaction(): ${promise('void')};`,
  `  commitTransaction(): ${promise('void')};`,
  `  rollbackTransaction(): ${promise('void')};`,
  '}',
  'export declare class DataSource {',
  '  getRepository<T>(target: new () => T): Repository<T>;',
  `  transaction<T>(work: (manager: EntityManager) => ${promise('T')}): ${promise('T')};`,
  '  createQueryRunner(): QueryRunner;',
  '}',
  'type RelationOptions = { lazy?: boolean; eager?: boolean };',
  'export declare function Entity(): ClassDecorator;',
  'export declare function Column(): PropertyDecorator;',
  'export declare function ManyToOne(type: () => Function, options?: RelationOptions): PropertyDecorator;',
  'export declare function OneToMany(',
  '  type: () => Function, inverse: (value: any) => unknown, options?: RelationOptions,',
  '): PropertyDecorator;',
].join('\n');

const SEQUELIZE = [
  'export declare class Model {',
  `  save(): ${promise('this')};`,
  `  destroy(): ${promise('void')};`,
  '  get(key: string): unknown;',
  `  static findAll(options?: object): ${promise('any[]')};`,
  '}',
  `export type BelongsToGetAssociationMixin<T> = (options?: object) => ${promise('T | null')};`,
  'export declare class Transaction {',
  `  commit(): ${promise('void')};`,
  `  rollback(): ${promise('void')};`,
  '  afterCommit(hook: () => unknown): void;',
  '}',
  'export declare class Sequelize {',
  `  transaction<T>(work: (transaction: Transaction) => ${promise('T')}): ${promise('T')};`,
  `  transaction(): ${promise('Transaction')};`,
  '}',
].join('\n');

const PRISMA = [
  'type Row = { id: string };',
  'type Delegate = {',
  `  findUnique(args: object): ${promise('Row | null')};`,
  `  findMany(args?: object): ${promise('Row[]')};`,
  `  create(args: object): ${promise('Row')};`,
  '};',
  'export declare class PrismaClient {',
  '  user: Delegate;',
  '  order: Delegate;',
  `  $transaction<T>(work: (tx: PrismaClient) => ${promise('T')}): ${promise('T')};`,
  `  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): ${promise('number')};`,
  '}',
].join('\n');

const SMITHY = `export declare class Client { send<T>(command: T): ${promise('unknown')}; }`;

function awsClient(client, commands) {
  return [
    "import { Client } from '@smithy/smithy-client';",
    `export declare class ${client} extends Client {}`,
    ...commands.map((command) => `export declare class ${command} { constructor(input: object); }`),
  ].join('\n');
}

const STRIPE = [
  'type Resource = {',
  `  create(params?: object, options?: { idempotencyKey?: string }): ${promise('{ id: string }')};`,
  `  retrieve(id: string): ${promise('{ id: string }')};`,
  '};',
  'declare class Stripe {',
  '  constructor(key: string);',
  '  customers: Resource;',
  '  paymentIntents: Resource;',
  '}',
  'export default Stripe;',
].join('\n');

const KNEX = [
  'export interface QueryBuilder {',
  '  where(condition: object): QueryBuilder;',
  '  insert(row: object): QueryBuilder;',
  `  then<R>(done: (rows: unknown[]) => R): ${promise('R')};`,
  '}',
  'export interface Knex {',
  '  (table: string): QueryBuilder;',
  `  transaction<T>(work: (trx: Knex) => ${promise('T')}): ${promise('T')};`,
  '}',
  'declare function knex(config: object): Knex;',
  'export default knex;',
].join('\n');

export const IO_PACKAGES = {
  pg: [
    'export declare class Pool {',
    `  query(text: string, values?: unknown[]): ${promise('{ rows: any[] }')};`,
    '}',
  ].join('\n'),
  typeorm: TYPEORM,
  sequelize: SEQUELIZE,
  '@prisma/client': PRISMA,
  knex: KNEX,
  '@smithy/smithy-client': SMITHY,
  '@aws-sdk/client-sqs': awsClient('SQSClient', ['SendMessageCommand', 'ReceiveMessageCommand']),
  '@aws-sdk/client-dynamodb': awsClient('DynamoDBClient', ['GetItemCommand', 'PutItemCommand']),
  axios: [
    `type Response = ${promise('{ data: any }')};`,
    'type Config = { headers?: Record<string, string> };',
    'declare const axios: {',
    '  get(url: string, config?: Config): Response;',
    '  post(url: string, body?: unknown, config?: Config): Response;',
    '};',
    'export default axios;',
  ].join('\n'),
  stripe: STRIPE,
  kafkajs: [
    'export declare class Producer {',
    `  send(record: { topic: string; messages: unknown[] }): ${promise('void')};`,
    `  connect(): ${promise('void')};`,
    '}',
    'export declare class Kafka { producer(): Producer; }',
  ].join('\n'),
  bullmq: [
    'export declare class Queue {',
    '  constructor(name: string);',
    `  add(name: string, data: unknown, options?: { jobId?: string }): ${promise('unknown')};`,
    '}',
  ].join('\n'),
  'p-retry': `export default function pRetry<T>(work: () => ${promise('T')}, options?: object): ${promise('T')};`,
  'async-mutex': [
    'export declare class Mutex {',
    `  runExclusive<T>(work: () => ${promise('T')}): ${promise('T')};`,
    `  acquire(): ${promise('() => void')};`,
    '}',
  ].join('\n'),
};
