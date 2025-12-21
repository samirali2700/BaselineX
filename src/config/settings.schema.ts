import { z } from 'zod';

/**
 * Supported execution modes
 */

const RunModeSchema = z.enum(['manual', 'scheduled']);

/**
 * Supported output formats
 */
const OutputFormatSchema = z.enum(['console', 'json']);

/**
 * Supported logging levels
 */
const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR']);

/**
 * Run Configuration
 */
const BaselineSettingsSchema = z.object({
    required_successful_probes: z.number().int().positive().default(5),
});

/**
 * Run Configuration
 */
const RunSettingsSchema = z.object({
    mode: RunModeSchema.default('manual'),
    interval_minutes: z.number().int().positive().default(60),
    timeout_seconds: z.number().int().positive().default(5),
});

/**
 * Comparison / validation behavior
 */
const ComparisonSettingsSchema = z.object({
  allow_added_fields: z.boolean().default(true),
  allow_removed_fields: z.boolean().default(false),
});

/**
 * Failure handling behavior
 */
const FailureSettingsSchema = z.object({
  stop_on_first_failure: z.boolean().default(false),
  fail_threshold: z.number().int().nonnegative().default(1),
});

/**
 * Output configuration
 */
const OutputSettingsSchema = z.object({
  format: OutputFormatSchema.default("console"),
  save_results: z.boolean().default(true),
  results_path: z.string().default("./baseline_results/"),
});

/**
 * Logging configuration
 */
const LoggingSettingsSchema = z.object({
  log_level: LogLevelSchema.default("INFO"),
});

/**
 * Root settings schema
 */
export const SettingsSchema = z.object({
    version: z.string(),
    name: z.string(),
    settings: z.object({
        baseline: BaselineSettingsSchema,
        run: RunSettingsSchema,
        comparison: ComparisonSettingsSchema,
        failure: FailureSettingsSchema,
        output: OutputSettingsSchema,
        logging: LoggingSettingsSchema,
    })
});

export type SettingsConfig = z.infer<typeof SettingsSchema>;