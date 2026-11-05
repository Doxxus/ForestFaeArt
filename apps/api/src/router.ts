import { authRouter } from "./routers/auth";
import { catalogRouter } from "./routers/catalog";
import { contentRouter, siteRouter } from "./routers/content";
import { eventsRouter } from "./routers/events";
import { imagesRouter } from "./routers/images";
import { inquiriesRouter } from "./routers/inquiries";
import { importRouter } from "./routers/import";
import { inventoryRouter } from "./routers/inventory";
import { labelsRouter } from "./routers/labels";
import { productsRouter } from "./routers/products";
import { customersRouter, posRouter, salesRouter } from "./routers/sales";
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
  inquiries: inquiriesRouter,
  import: importRouter,
  inventory: inventoryRouter,
  categories: categoriesRouter,
  metadata: metadataRouter,
  catalog: catalogRouter,
  content: contentRouter,
  site: siteRouter,
  events: eventsRouter,
  labels: labelsRouter,
  sales: salesRouter,
  customers: customersRouter,
  pos: posRouter,
});

export type AppRouter = typeof appRouter;
