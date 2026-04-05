var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var ALLOWED_ORIGINS = [
  "https://garfieldapp.pages.dev",
  "http://localhost:8000",
  "http://localhost:8080"
];
var DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;
var RATE_LIMIT_MAX = 30;
var MIGRATE_MAX = 500;
var TOP_N = 10;
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    let response;
    try {
      if (url.pathname === "/top" && request.method === "GET") {
        response = await handleGetTop(env);
      } else if (url.pathname === "/favorite" && request.method === "POST") {
        response = await handlePostFavorite(request, env);
      } else if (url.pathname === "/migrate" && request.method === "POST") {
        response = await handleMigrate(request, env);
      } else {
        response = jsonResponse({ error: "Not found" }, 404);
      }
    } catch {
      response = jsonResponse({ error: "Internal error" }, 500);
    }
    return withCors(request, response);
  }
};
async function handleGetTop(env) {
  const cached = await env.FAVORITES.get("top10", "json");
  return new Response(JSON.stringify(cached || []), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
    }
  });
}
__name(handleGetTop, "handleGetTop");
async function handlePostFavorite(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimitKey = `ratelimit:${ip}`;
  const rateCount = parseInt(await env.FAVORITES.get(rateLimitKey) || "0", 10);
  if (rateCount >= RATE_LIMIT_MAX) {
    return jsonResponse({ error: "Rate limited" }, 429);
  }
  await env.FAVORITES.put(rateLimitKey, String(rateCount + 1), { expirationTtl: 60 });
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { date, action } = body;
  if (!date || !DATE_PATTERN.test(date)) {
    return jsonResponse({ error: "Invalid date format (expected YYYY/MM/DD)" }, 400);
  }
  if (action !== "add" && action !== "remove") {
    return jsonResponse({ error: 'Invalid action (expected "add" or "remove")' }, 400);
  }
  const counts = await env.FAVORITES.get("counts", "json") || {};
  const current = counts[date] || 0;
  if (action === "add") {
    counts[date] = current + 1;
  } else {
    counts[date] = Math.max(0, current - 1);
    if (counts[date] === 0) delete counts[date];
  }
  await env.FAVORITES.put("counts", JSON.stringify(counts));
  const sorted = Object.entries(counts).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => b.count - a.count).slice(0, TOP_N);
  await env.FAVORITES.put("top10", JSON.stringify(sorted));
  return jsonResponse({ ok: true, count: counts[date] || 0 });
}
__name(handlePostFavorite, "handlePostFavorite");
async function handleMigrate(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const migrateKey = `migrated:${ip}`;
  const alreadyMigrated = await env.FAVORITES.get(migrateKey);
  if (alreadyMigrated) {
    return jsonResponse({ ok: true, skipped: true, message: "Already migrated" });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { dates } = body;
  if (!Array.isArray(dates) || dates.length === 0) {
    return jsonResponse({ error: "Expected non-empty dates array" }, 400);
  }
  if (dates.length > MIGRATE_MAX) {
    return jsonResponse({ error: `Max ${MIGRATE_MAX} dates per migration` }, 400);
  }
  const validDates = dates.filter((d) => typeof d === "string" && DATE_PATTERN.test(d));
  if (validDates.length === 0) {
    return jsonResponse({ error: "No valid dates found" }, 400);
  }
  const counts = await env.FAVORITES.get("counts", "json") || {};
  for (const d of validDates) {
    counts[d] = (counts[d] || 0) + 1;
  }
  await env.FAVORITES.put("counts", JSON.stringify(counts));
  const sorted = Object.entries(counts).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => b.count - a.count).slice(0, TOP_N);
  await env.FAVORITES.put("top10", JSON.stringify(sorted));
  await env.FAVORITES.put(migrateKey, "1");
  return jsonResponse({ ok: true, migrated: validDates.length });
}
__name(handleMigrate, "handleMigrate");
function resolveOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".garfieldapp.pages.dev")) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}
__name(resolveOrigin, "resolveOrigin");
function corsHeaders(request) {
  return new Headers({
    "Access-Control-Allow-Origin": resolveOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  });
}
__name(corsHeaders, "corsHeaders");
function withCors(request, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request).entries()) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(withCors, "withCors");
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");

// ../../../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-TJl8Id/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-TJl8Id/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
