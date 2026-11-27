import { Table, DefaultScope, Model } from 'sequelize-typescript';
@DefaultScope({ include: [A] })
class DefaultScope {}
