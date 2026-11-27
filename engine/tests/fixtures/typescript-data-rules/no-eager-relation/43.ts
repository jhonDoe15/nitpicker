import { DefaultScope, Table } from 'sequelize-typescript';
@DefaultScope(() => { return { include: [Customer] }; })
@Table class Order {}