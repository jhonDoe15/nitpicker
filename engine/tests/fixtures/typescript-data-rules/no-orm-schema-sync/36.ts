import { TypeOrmModule } from "@nestjs/typeorm"; export const m = TypeOrmModule.forRootAsync({ useFactory: (config) => { return { url: config.get("URL"), synchronize: true }; } });
