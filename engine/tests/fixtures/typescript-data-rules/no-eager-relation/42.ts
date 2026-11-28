import { DefaultScope, Table } from 'sequelize-typescript';
@DefaultScope(() => ({ include: [Customer] }))
@Table class Order {}