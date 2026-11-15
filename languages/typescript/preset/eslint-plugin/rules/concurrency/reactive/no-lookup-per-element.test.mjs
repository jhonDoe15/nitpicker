import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-lookup-per-element.mjs';

const RX =
  'import { from, of, defer, mergeMap, concatMap, switchMap, flatMap, bufferCount, toArray, map, take, tap, filter } from "rxjs";\n';
const STORE = [
  "import { Repository } from 'typeorm';",
  'export class Owner { id = ""; }',
  'export class OwnerService {',
  '  constructor(private readonly ownerRepository: Repository<Owner>) {}',
  '  async ownerOf(id: string) { return this.ownerRepository.findOneBy({ id }); }',
  `  label(id: string) { return \`owner \${id}\`; }`,
  '}',
].join('\n');

const { tester, typed } = typedIoProject('reactive-lookup', STORE);
const untyped = typescriptRuleTester();

const TYPED_HEADER = `${RX}import { Repository } from "typeorm";\nimport { Owner, OwnerService } from "./store";\ndeclare const owners: Repository<Owner>;\ndeclare const service: OwnerService;\ndeclare const ids: string[];\n`;

const error = (operator, callee, collection = 'ids') => [
  { messageId: 'lookup', data: { operator, callee, collection } },
];

const ownersCall = '`owners.findOneBy()`';
const serviceCall = '`service.ownerOf()`, which calls `this.ownerRepository.findOneBy()`';

tester.run('no-lookup-per-element', rule, {
  valid: [
    `${TYPED_HEADER}from(ids).pipe(mergeMap((id) => from(owners.findBy({ id: ids }))));`,
    `${TYPED_HEADER}from(new Set([ids[0]])).pipe(concatMap((id) => from(owners.findOneBy({ id }))));`,
    `${TYPED_HEADER}from(ids).pipe(concatMap((id) => from(owners.save({ id }))));`,
    `${TYPED_HEADER}from(ids).pipe(bufferCount(50), mergeMap((batch) => owners.findBy({ id: batch })));`,
    `${TYPED_HEADER}from(ids).pipe(toArray(), mergeMap((all) => owners.findBy({ id: all })));`,
    `${TYPED_HEADER}from(ids).pipe(mergeMap((id) => of(service.label(id))));`,
    `${TYPED_HEADER}from(ids).pipe(map((id) => service.label(id)), mergeMap((label) => of(label)));`,
    `${TYPED_HEADER}from(owners.findBy({ id: ids })).pipe(mergeMap((rows) => of(rows)));`,
    `${TYPED_HEADER}from(["a", "b"]).pipe(mergeMap((id) => owners.findOneBy({ id })));`,
    `${TYPED_HEADER}clicks$.pipe(mergeMap((id) => owners.findOneBy({ id })));`,
    `${TYPED_HEADER}from(ids).pipe(mergeMap(() => owners.findBy({ id: ids })));`,
    `${TYPED_HEADER}from(ids).pipe(take(3), mergeMap((id) => owners.findOneBy({ id })));`,
    `${TYPED_HEADER}from(ids).pipe(map((id) => owners.findOneBy({ id })));`,
    `${TYPED_HEADER}owners.findBy({ id: ids }).then((rows) => from(rows).pipe(mergeMap((row) => of(row.id))));`,
    `${TYPED_HEADER}from(ids).pipe(mergeMap((id) => fetch(id)));`,
    'from(ids).pipe(mergeMap((id) => owners.findOneBy({ id })));',
  ].map(typed),
  invalid: [
    {
      ...typed(`${TYPED_HEADER}from(ids).pipe(mergeMap((id) => from(owners.findOneBy({ id }))));`),
      errors: error('mergeMap', ownersCall),
    },
    {
      ...typed(`${TYPED_HEADER}from(ids).pipe(concatMap((id) => from(owners.findOneBy({ id }))));`),
      errors: error('concatMap', ownersCall),
    },
    {
      ...typed(`${TYPED_HEADER}from(ids).pipe(switchMap((id) => from(owners.findOneBy({ id }))));`),
      errors: error('switchMap', ownersCall),
    },
    {
      ...typed(
        `${TYPED_HEADER}from(ids).pipe(mergeMap((id) => from(owners.findOneBy({ id })), 4));`,
      ),
      errors: error('mergeMap', ownersCall),
    },
    {
      ...typed(
        `${TYPED_HEADER}from(ids).pipe(mergeMap((id) => defer(() => service.ownerOf(id))));`,
      ),
      errors: error('mergeMap', serviceCall),
    },
    {
      ...typed(
        `${TYPED_HEADER}const lookup = (id: string) => from(service.ownerOf(id)); from(ids).pipe(concatMap(lookup));`,
      ),
      errors: error('concatMap', serviceCall),
    },
    {
      ...typed(
        `${TYPED_HEADER}from(ids).pipe(filter(Boolean), tap(console.log), concatMap((id) => from(service.ownerOf(id))));`,
      ),
      errors: error('concatMap', serviceCall),
    },
    {
      ...typed(
        `${TYPED_HEADER}from(ids.map((id) => id.trim())).pipe(concatMap((id) => from(owners.findOneBy({ id }))));`,
      ),
      errors: error('concatMap', ownersCall, 'ids.map((id) => id.trim())'),
    },
    {
      ...typed(
        `${TYPED_HEADER}of(...ids).pipe(concatMap((id) => from(owners.findOneBy({ id }))));`,
      ),
      errors: error('concatMap', ownersCall),
    },
  ],
});

untyped.run('no-lookup-per-element without types', rule, {
  valid: [
    `${RX}from(ids).pipe(bufferCount(20), mergeMap((batch) => orderRepository.findByIds(batch)));`,
    `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id))));`,
    `${RX}from(ids).pipe(mergeMap((id) => of(id.trim())));`,
  ],
  invalid: [
    {
      code: `${RX}from(ids).pipe(concatMap((id) => from(orderRepository.findOne(id))));`,
      errors: error('concatMap', '`orderRepository.findOne()`'),
    },
    {
      code: `${RX}async function lookup(id) { return orderRepository.findOne(id); }\nfrom(ids).pipe(concatMap((id) => from(lookup(id))));`,
      errors: error('concatMap', '`orderRepository.findOne()`'),
    },
    {
      code: `${RX}from(ids).pipe(concatMap((id) => from(fetch(id))));`,
      errors: error('concatMap', '`fetch()`'),
    },
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(orderRepository.findOne(id)), 4));`,
      errors: error('mergeMap', '`orderRepository.findOne()`'),
    },
  ],
});
