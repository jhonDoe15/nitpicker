import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRootAsync({ useFactory: () => ({ type: "postgres", synchronize: false }) });
