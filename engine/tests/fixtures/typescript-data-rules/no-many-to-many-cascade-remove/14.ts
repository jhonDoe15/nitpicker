import * as o from '@mikro-orm/core';
class Post { @o.ManyToMany(() => Tag, { cascade: [o.Cascade.ALL] }) tags = new o.Collection<Tag>(this); }