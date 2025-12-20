import { request } from "undici";

export async function probeEndpoint(
  url: string,
  method: string,
  body?: unknown,
  timeoutMs = 5000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { statusCode, headers, body: responseBody } = await request(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
    });

    const text = await responseBody.text();

    return {
      statusCode,
      headers,
      bodySize: text.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}
