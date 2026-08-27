/**
 * @fileoverview Sends a single privacy-bounded `app.startup` event to Microsoft Application Insights on first visit.
 * Mirrors `SessionLens/src/main/services/TelemetryService.ts` and `TurkiyeEarthquakeForecast/src/lib/telemetry.ts`
 * but runs in the browser (Vite): parses the same connection string, persists a durable anonymous
 * `installationId` in localStorage, and POSTs one `EventData` envelope to `IngestionEndpoint/v2/track`
 * per page load.
 */

const DEFAULT_CONNECTION_STRING =
  "InstrumentationKey=57d6037c-32f2-4e33-8afc-9bca358e1edc;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/;LiveEndpoint=https://northeurope.livediagnostics.monitor.azure.com/;ApplicationId=ff3ae8d8-26c5-4100-ab92-7eb53497d2bf";

const getEnv = (key: string): string | undefined => {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (viteEnv && typeof viteEnv[key] === "string") return viteEnv[key];
  } catch {
    // ignore
  }
  try {
    const nodeEnv = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env;
    if (nodeEnv && typeof nodeEnv[key] === "string") return nodeEnv[key];
  } catch {
    // ignore
  }
  return undefined;
};

const CONNECTION_STRING =
  getEnv("VITE_APPLICATIONINSIGHTS_CONNECTION_STRING") ??
  getEnv("VITE_APPINSIGHTS_CONNECTION_STRING") ??
  getEnv("NEXT_PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING") ??
  getEnv("NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING") ??
  DEFAULT_CONNECTION_STRING;

interface ApplicationInsightsConnection {
  instrumentationKey: string;
  ingestionUrl: string;
}

type TelemetryFetcher = typeof fetch;

const STORAGE_KEY = "telemetry-installation-id";
const APP_NAME = "ChessAnalyzer";
const EVENT_NAME = "app.startup";

let startupTracked = false;

/**
 * Extracts the ingestion identity and endpoint from an Application Insights connection string.
 */
export const parseConnectionString = (connectionString: string): ApplicationInsightsConnection => {
  const fields = new Map(
    connectionString
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        if (separator === -1) return [entry, ""] as const;
        return [entry.slice(0, separator), entry.slice(separator + 1)] as const;
      }),
  );
  const instrumentationKey = fields.get("InstrumentationKey");
  const ingestionEndpoint = fields.get("IngestionEndpoint");
  if (!instrumentationKey || !ingestionEndpoint) {
    throw new Error("Application Insights connection string is invalid.");
  }
  return {
    instrumentationKey,
    ingestionUrl: new URL("v2/track", ingestionEndpoint).toString(),
  };
};

export const APPLICATION_INSIGHTS = parseConnectionString(CONNECTION_STRING);

/**
 * Returns the durable anonymous identifier from localStorage, creating it when missing or malformed.
 */
const getOrCreateInstallationId = (): string => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return globalThis.crypto?.randomUUID?.() ?? "";
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && uuidPattern.test(existing)) return existing;
    const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage quota or privacy mode — still return the generated id for this visit.
    }
    return next;
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

/**
 * Resets the per-load guard. Intended for tests only.
 */
export const resetTelemetryForTests = (): void => {
  startupTracked = false;
};

/**
 * Sends at most one `app.startup` event per page load to Application Insights.
 * Fire-and-forget: failures are swallowed so tracking never breaks the UI.
 */
export async function trackAppStartup(options?: {
  fetcher?: TelemetryFetcher;
  version?: string;
  locale?: string;
  platform?: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (startupTracked) return;
  startupTracked = true;

  try {
    if (
      window.navigator.doNotTrack === "1" ||
      (window.navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack === "1"
    ) {
      return;
    }
  } catch {
    // Ignore navigator access errors.
  }

  const fetcher: TelemetryFetcher = options?.fetcher ?? fetch;
  const version = options?.version ?? getEnv("VITE_APP_VERSION") ?? getEnv("NEXT_PUBLIC_APP_VERSION") ?? "1.2.0";
  const locale = options?.locale ?? window.navigator.language ?? "en";
  const platform =
    options?.platform ??
    (window.navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    window.navigator.platform ??
    "web";
  const installationId = getOrCreateInstallationId();
  if (!installationId) return;

  const body = JSON.stringify({
    name: `Microsoft.ApplicationInsights.${APPLICATION_INSIGHTS.instrumentationKey.replace(/-/g, "")}.Event`,
    time: new Date().toISOString(),
    iKey: APPLICATION_INSIGHTS.instrumentationKey,
    tags: {
      "ai.application.ver": version,
      "ai.user.id": installationId,
    },
    data: {
      baseType: "EventData",
      baseData: {
        ver: 2,
        name: EVENT_NAME,
        properties: {
          appName: APP_NAME,
          version,
          platform,
          locale,
        },
      },
    },
  });

  try {
    const response = await fetcher(APPLICATION_INSIGHTS.ingestionUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    } as RequestInit & { keepalive?: boolean });
    if (!response.ok) {
      if (getEnv("DEV") === "true" || getEnv("MODE") === "development") {
        console.warn(`[telemetry] ingestion failed HTTP ${response.status}`, await response.text().catch(() => ""));
      }
      return;
    }
    if (getEnv("DEV") === "true" || getEnv("MODE") === "development") {
      try {
        const result = (await (response as Response).clone().json()) as {
          itemsReceived?: number;
          itemsAccepted?: number;
          errors?: unknown[];
        };
        console.info(`[telemetry] app.startup sent`, {
          itemsReceived: result.itemsReceived,
          itemsAccepted: result.itemsAccepted,
          errors: result.errors,
        });
      } catch {
        console.info("[telemetry] app.startup sent", { status: response.status });
      }
    }
  } catch (error) {
    if (getEnv("DEV") === "true" || getEnv("MODE") === "development") {
      console.warn("[telemetry] network/CORS failure", error);
    }
  }
}
