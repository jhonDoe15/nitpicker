import { Entity, EntitySchema, ManyToMany, ManyToOne, OneToMany, OneToOne } from 'typeorm';
const removing = ['insert', 'remove'] as const;
class Post { @ManyToMany(() => Tag, { cascade: removing }) tags: Tag[]; }