const o = require('@mikro-orm/core');
class Post { @o.ManyToMany(() => Tag, { cascade: [o.Cascade.REMOVE] }) tags; }