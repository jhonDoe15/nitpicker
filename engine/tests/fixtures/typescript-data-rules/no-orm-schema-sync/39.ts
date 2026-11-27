import { User } from "./models/user.js"; import { Sequelize } from "sequelize"; export async function start() { await User.sync(); }
