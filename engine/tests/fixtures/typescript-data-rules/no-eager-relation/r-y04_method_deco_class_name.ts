import { OneToOne } from 'typeorm';
class OneToOne { @OneToOne({ eager: true }) m() {} }
