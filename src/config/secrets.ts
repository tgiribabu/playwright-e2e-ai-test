/** Secret resolution (<ENV>_<TENANT>_<NAME> → <ENV>_<NAME> → <NAME>) and log masking. */
/**
 * Secret resolution with tenant/environment scoping. For secret NAME "DB_PASSWORD", env "qa", tenant "acme":
 *   QA_ACME_DB_PASSWORD  →  QA_DB_PASSWORD  →  DB_PASSWORD   (first one set wins)
 * Values come from process.env (CI secret store) or git-ignored .env / .env.<env> files.
 */
const registered = new Set<string>();

export function secretCandidates(name: string, env: string, tenant: string): string[] {
  const E = env.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const T = tenant.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return [`${E}_${T}_${name}`, `${E}_${name}`, name];
}

export function resolveSecret(name: string, env: string, tenant: string, source: NodeJS.ProcessEnv = process.env): string {
  const keys = secretCandidates(name, env, tenant);
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== '') {
      registered.add(value);
      return value;
    }
  }
  throw new Error(`Missing secret "${name}" for env=${env} tenant=${tenant}. Set one of: ${keys.join(', ')} (see .env.example).`);
}

export function resolveOptionalSecret(name: string | undefined, env: string, tenant: string): string | undefined {
  if (!name) return undefined;
  try { return resolveSecret(name, env, tenant); } catch { return undefined; }
}

/** Replaces every resolved secret value in `text` with ***: used by the logger and reporters. */
export function maskSecrets(text: string): string {
  let out = text;
  for (const s of registered) if (s.length >= 4) out = out.split(s).join('***');
  return out;
}
