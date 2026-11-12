import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Env } from "./env";
import { appRouter } from "./router";
import { handleUpload } from "./media/upload";
import { handleCalendar } from "./calendar";
import { serveMedia } from "./media/serve";
import { newReference, referenceFor, withSecurityHeaders } from "./security";
import { runDatabaseBackup } from "./services/backup";
import { runMonitor } from "./services/monitor";
import { NIGHTLY_CRON } from "./schedule";
import { createContext } from "./trpc";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

async function route(req: Request, env: Env): Promise<Response> {
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
      // Expected problems (wrong password, not found) are normal. Only unexpected failures are logged, with the reference the person was shown.
      onError({ error, path }) {
        if (error.code !== "INTERNAL_SERVER_ERROR") return;
        console.error(
          JSON.stringify({
            event: "api-error",
            reference: referenceFor(error),
            path,
            name: (error.cause ?? error).constructor.name,
            message: String((error.cause as Error | undefined)?.message ?? error.message).slice(0, 500),
          }),
        );
      },
    });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return withSecurityHeaders(await route(req, env), env);
    } catch (error) {
      // Anything that slips past the handlers above still gets a reference, never a stack trace.
      const reference = newReference();
      console.error(JSON.stringify({ event: "api-unhandled", reference, path: new URL(req.url).pathname, message: String(error).slice(0, 500) }));
      return withSecurityHeaders(json({ error: "Something went wrong.", reference }, 500), env);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    if (controller.cron === NIGHTLY_CRON) ctx.waitUntil(runDatabaseBackup(env));
    else ctx.waitUntil(runMonitor(env));
  },
} satisfies ExportedHandler<Env>;
