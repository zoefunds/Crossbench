import fs from "node:fs/promises"; import path from "node:path"; import { Database } from "./lib/db.js";
const db = new Database(process.env.DATABASE_URL ?? ""); const dir = path.resolve("migrations");
for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) await db.pool.query(await fs.readFile(path.join(dir, file), "utf8"));
await db.close();
