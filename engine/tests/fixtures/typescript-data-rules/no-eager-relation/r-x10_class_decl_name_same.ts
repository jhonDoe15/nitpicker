import { ManyToMany } from 'typeorm';
class ManyToMany { @ManyToMany(() => B, { eager: true, cascade: true }) x: B[]; }
