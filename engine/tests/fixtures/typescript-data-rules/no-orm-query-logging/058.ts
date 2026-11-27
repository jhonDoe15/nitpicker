import { SequelizeModule } from "@nestjs/sequelize"; export const m = SequelizeModule.forRootAsync({ useFactory: async () => { return { dialect: "postgres" }; } });
