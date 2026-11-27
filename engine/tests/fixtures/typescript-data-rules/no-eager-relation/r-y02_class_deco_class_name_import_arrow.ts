import { ManyToMany } from 'typeorm';
@ManyToMany(() => B, { eager: true, cascade: true })
class ManyToMany {}
