import { authRouter } from "./routers/auth";
import { catalogRouter } from "./routers/catalog";
import { productsRouter } from "./routers/products";
import { settingsRouter } from "./routers/settings";
import { usersRouter } from "./routers/users";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(({ ctx }) => ({ ok: true as const, environment: ctx.env.ENVIRONMENT })),
  }),
  auth: authRouter,
  users: usersRouter,
  settings: settingsRouter,
  products: productsRouter,
  catalog: catalogRouter,
});

export type AppRouter = typeof appRouter;
