import { env } from "cloudflare:workers";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { initTRPC } from "@trpc/server";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { z } from "zod";

const note = sqliteTable("note", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
});

const t = initTRPC.create();
const d1 = () => (env as unknown as { DB: D1Database }).DB;

const router = t.router({
  ping: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => `hello ${input.name}`),
  addNote: t.procedure.input(z.object({ body: z.string().min(1) })).mutation(async ({ input }) => {
    await d1().exec("CREATE TABLE IF NOT EXISTS note (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL)");
    const db = drizzle(d1());
    await db.insert(note).values({ body: input.body });
    return db.select().from(note).all();
  }),
});

const handler = (req: Request) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req, router, createContext: () => ({}) });

export { handler as GET, handler as POST };
