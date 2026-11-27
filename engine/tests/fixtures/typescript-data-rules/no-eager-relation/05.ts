import { Cascade, Entity, EntitySchema, ManyToMany, ManyToOne, defineEntity } from '@mikro-orm/core';
@Entity() class Order { @ManyToOne(() => Customer) customer!: Customer; }