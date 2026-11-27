import { SequelizeModule } from "@nestjs/sequelize"; export const m = SequelizeModule.forRootAsync({ useFactory: () => { if (a) { return { dialect: "x" }; } return { dialect: "y" }; } });
