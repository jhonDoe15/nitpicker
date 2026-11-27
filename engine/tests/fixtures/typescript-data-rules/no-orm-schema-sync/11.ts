import { SequelizeModule } from "@nestjs/sequelize"; export const m = (base) => SequelizeModule.forRoot({ ...base, autoLoadModels: true });
