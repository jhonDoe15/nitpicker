const { ManyToOne } = require('typeorm');
class Order { @ManyToOne(() => Customer, { eager: true }) customer; }