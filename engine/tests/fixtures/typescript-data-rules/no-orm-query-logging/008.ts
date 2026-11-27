import { SequelizeModule } from "@nestjs/sequelize"; export const m = SequelizeModule.forRoot({ dialect: "postgres", logging: false });
