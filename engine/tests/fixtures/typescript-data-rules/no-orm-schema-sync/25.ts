import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRoot({ type: "postgres", autoLoadEntities: true, synchronize: process.env.NODE_ENV !== "production" });
