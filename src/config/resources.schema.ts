import { z } from "zod";

/**
 * Supported HTTP methods
 */
export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Synthetic request fixture schema
 * Values are intentionally generic / synthetic
 */
const RequestFixtureSchema = z.object({
  query: z.record(z.string(), z.any()).optional(),
  body: z.record(z.string(), z.any()).optional(),
});

/**
 * API endpoint definition
 */
const ApiEndpointSchema = z.object({
  path: z
    .string()
    .min(1, "Endpoint path cannot be empty")
    .startsWith("/", "Endpoint path must start with '/'"),

  method: HttpMethodSchema,

  expected_status: z
    .number()
    .int()
    .min(100)
    .max(599),

  expected_fields: z
    .array(z.string().min(1))
    .optional(),

  /**
   * Optional synthetic request fixture.
   * Used to ensure deterministic availability probing.
   */
  request: z
    .object({
      fixture: RequestFixtureSchema,
    })
    .optional(),

  /**
   * Structural indicators for response comparison.
   */
  required_fields: z
    .array(z.string().min(1))
    .optional(),
});

/**
 * Enforce that methods requiring a body define a request fixture
 */
const ApiEndpointWithConstraintsSchema = ApiEndpointSchema.superRefine(
  (endpoint, ctx) => {
    const methodsRequiringBody = ["POST", "PUT", "PATCH"];

    if (
      methodsRequiringBody.includes(endpoint.method) &&
      !endpoint.request?.fixture?.body
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `HTTP method ${endpoint.method} requires a synthetic request body fixture`,
        fatal: true
      });
    }

    return z.NEVER;
  }
);

/**
 * API definition
 */
const ApiSchema = z.object({
  name: z.string().min(1, "API name is required"),

  base_url: z
    .url("Base URL must be a valid URL")
    .refine(
      (url) => {
        const urlObj = new URL(url);
        // Allow http and https protocols
        if (!/^https?$/.test(urlObj.protocol.replace(":", ""))) {
          return false;
        }
        // Allow localhost, domain names, or IP addresses
        const hostname = urlObj.hostname;
        return (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "0.0.0.0" ||
          /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || // IP address
          /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname) // Domain
        );
      },
      { message: "Base URL must use HTTP or HTTPS protocol and have a valid hostname (localhost, domain, or IP)" }
    ),

  endpoints: z
    .array(ApiEndpointWithConstraintsSchema)
    .min(1, "Each API must define at least one endpoint"),
});

/**
 * Root resources schema
 */
export const ResourcesSchema = z.object({
  version: z.string(),
  apis: z
    .array(ApiSchema)
    .min(1, "At least one API must be defined")
    .superRefine((apis, ctx) => {
      const seen = new Set<string>();

      apis.forEach((api, index) => {
        if (seen.has(api.name)) {
          ctx.addIssue({
            code: "custom",
            message: "Duplicate API name found: " + api.name,
            path: [index, "name"],
            fatal: true
          })
        } else {
          seen.add(api.name);
        }
      })
    }),
});

/**
 * Inferred TypeScript type
 */
export type ResourcesConfig = z.infer<typeof ResourcesSchema>;
export type EndpointConfig = z.infer<typeof ApiEndpointWithConstraintsSchema>;
export type ApiConfig = z.infer<typeof ApiSchema>;
