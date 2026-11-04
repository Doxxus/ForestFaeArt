import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Env } from "./env";
import { appRouter } from "./router";
import { handleUpload } from "./media/upload";
import { handleCalendar } from "./calendar";
import { serveMedia } from "./media/serve";
import { createContext } from "./trpc";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === "/health") {
      const [database, media] = await Promise.all([
        env.DB.prepare("SELECT 1").first().then(() => true, () => false),
        env.MEDIA.head("health-check").then(() => true, () => false),
      ]);
      const ok = database && media;
      return json({ ok, environment: env.ENVIRONMENT, database, media }, ok ? 200 : 503);
    }

    if (pathname === "/events.ics" || /^\/events\/[a-z0-9-]+\.ics$/.test(pathname)) return handleCalendar(env, req, new URL(req.url));
    if (pathname === "/media/upload") return handleUpload(env, req, new URL(req.url));
    if (pathname.startsWith("/media/")) return serveMedia(env, req, new URL(req.url));

    if (pathname.startsWith("/trpc")) {
      return fetchRequestHandler({
        endpoint: "/trpc",
        req,
        router: appRouter,
        createContext: () => createContext(env, req),
      });
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
