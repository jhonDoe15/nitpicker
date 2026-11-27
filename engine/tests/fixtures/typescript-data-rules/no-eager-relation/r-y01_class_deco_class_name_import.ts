import { ManyToMany } from 'typeorm';
@ManyToMany({ eager: true, cascade: true })
class ManyToMany {}
