import { ManyToMany, OneToMany, ManyToOne, OneToOne, Cascade, EntitySchema, Entity } from '@mikro-orm/core';
class A { m(Cascade, @ManyToMany(() => B, { cascade: [Cascade.ALL] }) x) {} }
