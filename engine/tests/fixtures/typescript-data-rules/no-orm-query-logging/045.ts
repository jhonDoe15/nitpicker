import { SequelizeModule } from "@nestjs/sequelize"; export const m = SequelizeModule.forRootAsync({ useFactory: () => ({ dialect: "postgres", autoLoadModels: false }) });
