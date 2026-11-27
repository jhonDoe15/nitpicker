import { DefaultScope, Table } from 'sequelize-typescript';
@DefaultScope(() => { const nested = () => ({ include: [A] }); return { where: {} }; })
@Table class Order {}