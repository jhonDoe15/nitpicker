import { Cascade, Entity, EntitySchema, ManyToMany, ManyToOne, defineEntity } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
new EntitySchema({ name: 'Order', properties: { customer: { kind: ReferenceKind.MANY_TO_ONE, entity: 'Customer', eager: true } } });