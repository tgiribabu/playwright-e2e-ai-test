/** Leveled logger: one line per message, secrets masked. */
import { maskSecrets } from '../config/secrets';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info;

/**
 * One line per message (the old logger printed every line three times), secrets masked,
 * safe to call outside a test (no implicit test.step).
 */
export function createLogger(scope: string) {
  const write = (level: Level, msg: string, meta?: unknown) => {
    if (ORDER[level] < threshold) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${meta === undefined ? '' : ` ${JSON.stringify(meta)}`}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(maskSecrets(line));
  };
  return {
    debug: (m: string, meta?: unknown) => write('debug', m, meta),
    info: (m: string, meta?: unknown) => write('info', m, meta),
    warn: (m: string, meta?: unknown) => write('warn', m, meta),
    error: (m: string, meta?: unknown) => write('error', m, meta),
  };
}
export type Logger = ReturnType<typeof createLogger>;
