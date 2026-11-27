import { Sequelize } from "sequelize"; class User extends Model {} export const start = () => User.sync();
