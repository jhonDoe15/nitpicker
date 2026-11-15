import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-query-per-parent.mjs';

const STORE = [
  "import { Repository } from 'typeorm';",
  'export class Owner { id = ""; }',
  'export class ViewService {',
  '  constructor(private readonly viewRepository: Repository<Owner>) {}',
  '  async ownerOf(id: string) { return this.viewRepository.findOneBy({ id }); }',
  `  label(id: string) { return \`view \${id}\`; }`,
  '}',
].join('\n');

const LIST_QUERY = [
  "import { Query, Resolver } from '@nestjs/graphql';",
  "import { View } from './views';",
  'export class ViewsResolver {',
  '  @Query(() => [View]) views() { return []; }',
  '}',
].join('\n');

const { tester, typed } = typedIoProject('resolver-query', STORE, {
  'list-query.ts': LIST_QUERY,
  'views.ts': 'export class View { id = ""; }',
});

const NEST = [
  "import { Parent, ResolveField, Resolver, Query } from '@nestjs/graphql';",
  "import { Repository } from 'typeorm';",
  "import { View } from './views';",
  "import { Owner, ViewService } from './store';",
  'declare const loaders: { owner: { load(id: string): Promise<Owner> } };',
  'declare const rate: number;',
].join('\n');

const nest = (members, decorator = '@Resolver(() => View)') =>
  typed(
    [
      NEST,
      decorator,
      'export class ViewFields {',
      '  constructor(private readonly viewService: ViewService, private readonly ownerRepository: Repository<Owner>) {}',
      members,
      '}',
    ].join('\n'),
  );

const TYPE_GRAPHQL = [
  "import { FieldResolver, Resolver, Root } from 'type-graphql';",
  "import { Repository } from 'typeorm';",
  "import { View } from './views';",
  "import { Owner } from './store';",
  'declare const owners: Repository<Owner>;',
].join('\n');

const SDL = (list) =>
  [
    "import { ApolloServer } from '@apollo/server';",
    "import { Repository } from 'typeorm';",
    "import { Owner } from './store';",
    'declare const owners: Repository<Owner>;',
    `const typeDefs = \`type View { id: ID! owner: Owner } type Profile { id: ID! owner: Owner } type Query { views: ${list} }\`;`,
  ].join('\n');

const error = (callee) => ({
  messageId: 'perParent',
  data: { callee: callee.replaceAll(/`([^`]+)`/gu, '`$1()`'), parent: 'View' },
});

tester.run('no-query-per-parent', rule, {
  valid: [
    nest(
      '@ResolveField() async owner(@Parent() view: View) { return this.prisma.user.findUnique({ where: { id: view.id } }); }',
    ),
    nest(
      '@ResolveField() async posts(@Parent() view: View) { return this.prisma.view.findUnique({ where: { id: view.id } }).posts(); }',
    ),
    nest(
      '@ResolveField() async owner(@Parent() view: View) { return loaders.owner.load(view.id); }',
    ),
    nest('@ResolveField() async owner(@Parent() view: View) { return view.id; }'),
    nest('@ResolveField() label(@Parent() view: View) { return this.viewService.label(view.id); }'),
    nest('@ResolveField() async owner(@Parent() view: View) { return view.owner; }'),
    nest(
      'async owner(@Parent() view: View) { return this.ownerRepository.findOneBy({ id: view.id }); }',
    ),
    nest(
      '@ResolveField() async owner(@Parent() view: View) { return this.ownerRepository.findOneBy({ id: view.id }); }',
      '@Resolver(() => Owner)',
    ),
    nest(
      '@ResolveField() async owner() { return this.ownerRepository.findOneBy({ id: "x" }); }',
      '@Resolver()',
    ),
    nest(
      '@ResolveField() async owners(@Parent() view: View) { return loaders.owner.loadMany(view.ids); }',
    ),
    nest(
      '@ResolveField() async owner(@Parent() view: View) { return context.cache.get(view.id); }',
    ),
    typed(
      [
        NEST,
        '@Resolver(() => Owner)',
        'export class OwnerFields {',
        '  constructor(private readonly viewService: ViewService) {}',
        '  @ResolveField() async current(@Parent() owner: Owner) { return this.viewService.ownerOf(owner.id); }',
        '}',
      ].join('\n'),
    ),
    typed(
      [
        TYPE_GRAPHQL,
        '@Resolver(() => View)',
        'export class ViewFields {',
        '  @FieldResolver() owner(@Root() view: View) { return view.owner; }',
        '}',
      ].join('\n'),
    ),
    typed(
      `${SDL('Profile')}\nconst resolvers = { Profile: { owner: (view) => view.owner } };\nnew ApolloServer({ typeDefs, resolvers });`,
    ),
    typed(
      `${SDL('Profile')}\nconst resolvers = { Profile: { owner: (view) => owners.findOneBy({ id: view.id }) } };\nnew ApolloServer({ typeDefs, resolvers });`,
    ),
    typed(
      `${SDL('[View!]!')}\nconst resolvers = { Query: { views: () => owners.find() } };\nnew ApolloServer({ typeDefs, resolvers });`,
    ),
    typed(
      `${SDL('[View!]!')}\nconst config = { View: { owner: (view) => owners.findOneBy({ id: view.id }) } };\nnew ApolloServer({ typeDefs, resolvers: {} });`,
    ),
  ],
  invalid: [
    {
      ...nest(
        '@ResolveField() async owner(@Parent() view: View) { return await this.ownerRepository.findOneBy({ id: view.id }); }',
      ),
      errors: [error('`this.ownerRepository.findOneBy`')],
    },
    {
      ...nest(
        '@ResolveField(() => Owner) async owner(@Parent() view: View) { return this.viewService.ownerOf(view.id); }',
        '@Resolver(View)',
      ),
      errors: [error('`this.viewService.ownerOf`, which calls `this.viewRepository.findOneBy`')],
    },
    {
      ...nest(
        '@ResolveField() async owner(@Parent() view: View) { return this.viewService.ownerOf(view.id); }',
        "@Resolver('View')",
      ),
      errors: [error('`this.viewService.ownerOf`, which calls `this.viewRepository.findOneBy`')],
    },
    {
      ...nest(
        '@ResolveField() async owner(@Parent() view: View) { return this.viewService.ownerOf(view.id); }',
        '',
      ),
      errors: [error('`this.viewService.ownerOf`, which calls `this.viewRepository.findOneBy`')],
    },
    {
      ...typed(
        [
          TYPE_GRAPHQL,
          '@Resolver((of) => View)',
          'export class ViewFields {',
          '  @FieldResolver() async owner(@Root() view: View) { return owners.findOneBy({ id: view.id }); }',
          '}',
        ].join('\n'),
      ),
      errors: [error('`owners.findOneBy`')],
    },
    {
      ...typed(
        `${SDL('[View!]!')}\nconst resolvers = { View: { owner: async (view) => owners.findOneBy({ id: view.id }) } };\nnew ApolloServer({ typeDefs, resolvers });`,
      ),
      errors: [error('`owners.findOneBy`')],
    },
    {
      ...typed(
        `${SDL('[View]')}\nconst resolvers = { View: { owner: { resolve: async (view) => owners.findOneBy({ id: view.id }) } } };\nnew ApolloServer({ typeDefs, resolvers });`,
      ),
      errors: [error('`owners.findOneBy`')],
    },
    {
      ...typed(
        [
          "import Fastify from 'fastify';",
          "import mercurius from 'mercurius';",
          SDL('[View!]!').split('\n').slice(1).join('\n'),
          'const app = Fastify(); app.register(mercurius, { schema: typeDefs, resolvers: { View: { owner(view) { return owners.findOneBy({ id: view.id }); } } } });',
        ].join('\n'),
      ),
      errors: [error('`owners.findOneBy`')],
    },
    {
      ...typed(
        [
          "import { createSchema } from 'graphql-yoga';",
          SDL('[View!]!').split('\n').slice(1).join('\n'),
          'export const schema = createSchema({ typeDefs, resolvers: { View: { owner: (view) => owners.findOneBy({ id: view.id }) } } });',
        ].join('\n'),
      ),
      errors: [error('`owners.findOneBy`')],
    },
  ],
});

const UNTYPED = [
  "import { ApolloServer } from '@apollo/server';",
  'const typeDefs = `type Query { views: [View!]! }`;',
].join('\n');

typescriptRuleTester().run('no-query-per-parent without types', rule, {
  valid: [
    `${UNTYPED}\nconst resolvers = { View: { owner: (view, args, ctx) => ctx.loaders.owner.load(view.ownerId) } };`,
    `${UNTYPED}\nconst resolvers = { Query: { views: () => viewRepository.find() } };`,
    'const resolvers = { View: { owner: (view) => viewRepository.findOne(view.id) } };',
  ],
  invalid: [
    {
      code: `${UNTYPED}\nconst resolvers = { View: { owner: (view) => ownerRepository.findOne(view.ownerId) } };`,
      errors: [{ messageId: 'perParent' }],
    },
  ],
});
