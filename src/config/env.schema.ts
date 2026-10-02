/** zod schema for config/environments/*.json (secrets referenced by env-var name). */
import { z } from 'zod';

/** A secret is referenced by the NAME of an environment variable, never by value. */
const SecretName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'secret names are UPPER_SNAKE_CASE env var names');

const UiSchema = z.object({
  baseUrl: z.string().url(),
  /** Optional UI login credentials (secret names). */
  usernameSecret: SecretName.optional(),
  passwordSecret: SecretName.optional(),
});

const ApiSchema = z.object({
  baseUrl: z.string().url(),
  healthPath: z.string().default('/health'),
  tokenPath: z.string(),
  usernameSecret: SecretName,
  passwordSecret: SecretName,
  timeoutMs: z.number().int().positive().default(30_000),
  required: z.boolean().default(true),
});

const DbSchema = z.object({
  host: z.string(),
  port: z.number().int().default(5432),
  database: z.string(),
  user: z.string(),
  passwordSecret: SecretName,
  ssl: z.boolean().default(true),
  poolMax: z.number().int().positive().default(5),
  statementTimeoutMs: z.number().int().positive().default(30_000),
  required: z.boolean().default(true),
});

const SalesforceSchema = z.object({
  loginUrl: z.string().url(),
  instanceUrl: z.string().url().optional(),
  apiVersion: z.string().regex(/^\d+\.\d$/).default('62.0'),
  authFlow: z.enum(['jwt', 'client_credentials']),
  clientIdSecret: SecretName,
  clientSecretSecret: SecretName.optional(),
  usernameSecret: SecretName.optional(),
  privateKeyPathSecret: SecretName.optional(),
  required: z.boolean().default(true),
});

export const EnvFileSchema = z.object({
  name: z.string(),
  readOnly: z.boolean().default(false),
  defaultTenant: z.string(),
  ui: UiSchema,
  api: ApiSchema.optional(),
  db: DbSchema.optional(),
  salesforce: SalesforceSchema.optional(),
  tenants: z.record(z.object({
    displayName: z.string(),
    /** Per-tenant overrides, deep-merged over the environment defaults. */
    overrides: z.record(z.unknown()).optional(),
  })).refine((t) => Object.keys(t).length > 0, 'at least one tenant is required'),
});

export type EnvFile = z.infer<typeof EnvFileSchema>;
export type ApiSettings = z.infer<typeof ApiSchema>;
export type DbSettings = z.infer<typeof DbSchema>;
export type SalesforceSettings = z.infer<typeof SalesforceSchema>;
