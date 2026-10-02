/** Sandboxed per-test file system: traversal/symlink protection, safe names, allowlist, quota. */
import * as fs from 'fs';
import * as path from 'path';
import type { Download } from '@playwright/test';

export interface SandboxOptions {
  /** Allowed extensions for anything written into the sandbox. */
  allowedExtensions?: string[];
  /** Total bytes the sandbox may hold (protects CI disks from runaway downloads). */
  quotaBytes?: number;
}

const DEFAULT_EXT = ['.csv', '.xlsx', '.json', '.txt', '.pdf', '.png', '.jpg', '.zip', '.docx'];

/**
 * Sandboxed file system for test artifacts. Every path is resolved inside `root`:
 *  - rejects absolute paths, "..", NUL bytes and symlinks that escape the sandbox
 *  - sanitizes server-suggested download names (no path components, no control/reserved chars)
 *  - enforces an extension allowlist and a size quota
 *  - removable in one call (the fixture deletes it after passing tests, keeps it on failure)
 */
export class SecureFileSystem {
  readonly root: string;
  private readonly allowed: string[];
  private readonly quota: number;

  constructor(root: string, opts: SandboxOptions = {}) {
    fs.mkdirSync(root, { recursive: true });
    this.root = fs.realpathSync(root);
    this.allowed = (opts.allowedExtensions ?? DEFAULT_EXT).map((e) => e.toLowerCase());
    this.quota = opts.quotaBytes ?? 200 * 1024 * 1024;
  }

  /** Resolves a relative path safely inside the sandbox, or throws. */
  resolve(relative: string): string {
    if (!relative || relative.includes('\0')) throw new Error('invalid path');
    if (path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative)) throw new Error(`absolute paths are not allowed: ${relative}`);
    const full = path.resolve(this.root, relative);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error(`path escapes the sandbox: ${relative}`);
    // Symlink escape: the nearest existing ancestor must resolve inside the sandbox too.
    let probe = full;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const real = fs.realpathSync(probe);
    if (real !== this.root && !real.startsWith(this.root + path.sep)) throw new Error(`path escapes the sandbox via symlink: ${relative}`);
    return full;
  }

  /** Makes an untrusted name safe: basename only, no control/reserved characters, bounded length. */
  static sanitizeName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? '';
    const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 120);
    if (!clean) throw new Error(`unusable file name: ${JSON.stringify(name)}`);
    return clean;
  }

  write(relative: string, data: string | Buffer): string {
    const full = this.resolve(relative);
    this.assertExtension(full);
    this.assertQuota(Buffer.byteLength(data));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, full); // atomic: readers never see a half-written file
    return full;
  }

  read(relative: string): Buffer { return fs.readFileSync(this.resolve(relative)); }
  readText(relative: string): string { return this.read(relative).toString('utf8'); }
  exists(relative: string): boolean { return fs.existsSync(this.resolve(relative)); }
  remove(relative: string): void { fs.rmSync(this.resolve(relative), { force: true, recursive: true }); }

  list(): string[] {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(this.root, path.join(dir, e.name))]);
    return walk(this.root);
  }

  /** Saves a Playwright download under a sanitized name (server-provided names are untrusted). */
  async saveDownload(download: Download, subdir = 'downloads'): Promise<string> {
    const name = SecureFileSystem.sanitizeName(download.suggestedFilename());
    const full = this.resolve(path.join(subdir, name));
    this.assertExtension(full);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await download.saveAs(full);
    const size = fs.statSync(full).size;
    try { this.assertQuota(0); } catch (e) { fs.rmSync(full, { force: true }); throw e; }
    if (size === 0) throw new Error(`download ${name} is empty`);
    return full;
  }

  usedBytes(): number {
    return this.list().reduce((sum, f) => sum + fs.statSync(path.join(this.root, f)).size, 0);
  }

  /** Deletes the whole sandbox. */
  destroy(): void { fs.rmSync(this.root, { recursive: true, force: true }); }

  private assertExtension(full: string): void {
    const ext = path.extname(full).toLowerCase();
    if (!this.allowed.includes(ext)) throw new Error(`extension ${ext || '(none)'} not allowed in the sandbox (${this.allowed.join(', ')})`);
  }

  private assertQuota(incoming: number): void {
    if (this.usedBytes() + incoming > this.quota) throw new Error(`sandbox quota of ${this.quota} bytes exceeded`);
  }
}
