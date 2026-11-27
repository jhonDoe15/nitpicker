import { createConnection } from "typeorm"; export const c = createConnection({ type: "postgres", logging: true });
