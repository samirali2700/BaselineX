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
        code: z.ZodIssueCode.custom,
        message: `HTTP method ${endpoint.method} requires a synthetic request body fixture`,
      });
    }
  }
);

/**
 * API definition
 */
const ApiSchema = z.object({
  name: z.string().min(1, "API name is required"),

  base_url: z.url({
    protocol: /^https?$/,
    hostname: z.regexes.domain,
    error: "Base URL must be a valid HTTP or HTTPS URL",
  }),

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
    .min(1, "At least one API must be defined"),
});

/**
 * Inferred TypeScript type
 */
export type ResourcesConfig = z.infer<typeof ResourcesSchema>;
