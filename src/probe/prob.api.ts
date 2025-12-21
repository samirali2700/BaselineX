import { parse } from "path";
import { request } from "undici";

type ProbeResult = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  responseType: string;
  body?: string[];
  latencyMs: number;
  latencyBucket: "fast" | "slow" | "timeout";
}

export async function probeEndpoint(
  url: string,
  method: string,
  body?: unknown,
  timeoutMs = 5000
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  const startTime = performance.now();
  try {
    const { statusCode, headers, body: responseBody } = await request(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
    });
        // Calculate latency
    const latencyMs = Math.round(performance.now() - startTime);

    const contentType = headers["content-type"] as string | "unknown";

    let bodyText = "";
    let parsedBody: unknown = undefined;
    let extractedKeys: string[] | undefined;

    if (contentType?.includes("application/json")) {
      // JSON response
      const json = await responseBody.json();
      parsedBody = json;

      if (Array.isArray(json)) {
        // Array of objects → unique keys across all objects
        const keySet = new Set<string>();

        for (const item of json) {
          if (typeof item === "object" && item !== null) {
            Object.keys(item).forEach((key) => keySet.add(key));
          }
        }

          extractedKeys = Array.from(keySet);
        } else if (typeof json === "object" && json !== null) {
          // Single object → its keys
          extractedKeys = Object.keys(json);
        }

        // Estimate body size from stringified JSON
        bodyText = JSON.stringify(json);
    } else {
      // Non-JSON response (text, html, etc.)
      bodyText = await responseBody.text();
    }



    
    // Determine latency bucket (fast < 200ms, slow >= 200ms)
    const latencyBucket: "fast" | "slow" = latencyMs < 200 ? "fast" : "slow";

    return {
      statusCode,
      headers: headers as Record<string, string | string[]>,
      responseType: contentType,
      body: extractedKeys,
      latencyMs,
      latencyBucket,
    };
  } catch (error) {
    // Calculate latency on error too
    const latencyMs = Math.round(performance.now() - startTime);
    
    // If aborted (timeout), mark as timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw {
        error: "Request timeout",
        latencyMs,
        latencyBucket: "timeout" as const,
      };
    }
    
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
