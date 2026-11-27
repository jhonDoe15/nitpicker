import { DefaultScope, Table } from 'sequelize-typescript';
@DefaultScope(() => { if (archived) { return { include: [Archive] }; } return {}; })
@Table class Order {}