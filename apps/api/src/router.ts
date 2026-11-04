import { authRouter } from "./routers/auth";
import { catalogRouter } from "./routers/catalog";
import { imagesRouter } from "./routers/images";
import { importRouter } from "./routers/import";
import { inventoryRouter } from "./routers/inventory";
import { productsRouter } from "./routers/products";
import { settingsRouter } from "./routers/settings";
import { categoriesRouter, metadataRouter } from "./routers/taxonomy";
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
  images: imagesRouter,
  import: importRouter,
  inventory: inventoryRouter,
  categories: categoriesRouter,
  metadata: metadataRouter,
  catalog: catalogRouter,
});

export type AppRouter = typeof appRouter;
