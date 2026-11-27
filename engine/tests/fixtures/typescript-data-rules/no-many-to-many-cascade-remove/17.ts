import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
class Post { @ManyToMany(() => Tag, (t) => t.posts, { cascade: ['insert', 'remove'] }) tags: Tag[]; }