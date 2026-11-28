import { ManyToMany, Cascade } from '@mikro-orm/core';
class K { m(@ManyToMany(() => B, { cascade: [Cascade.ALL] }) x, Cascade) {} }
