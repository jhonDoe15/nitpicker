import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => ({ autoLoadEntities: true, synchronize: Boolean(config.get("DB_SYNC")) }) });
