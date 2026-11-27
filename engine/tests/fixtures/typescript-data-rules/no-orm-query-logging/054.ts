import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRoot({ type: "postgres", logging: true });
