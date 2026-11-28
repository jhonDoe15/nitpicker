import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ type: "postgres", synchronize: config.get("DB_SYNC") }) });
