/** Device matrix: browser/device groups selectable with DEVICES=. */
import { devices, Project } from '@playwright/test';

/**
 * Device matrix. Select with DEVICES (comma-separated group or project names):
 *   DEVICES=chromium            fast local default
 *   DEVICES=desktop,mobile      CI default
 *   DEVICES=webkit,mobile-safari
 */
export const DEVICE_GROUPS: Record<string, Project[]> = {
  desktop: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  mobile: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  tablet: [{ name: 'tablet-safari', use: { ...devices['iPad (gen 7)'] } }],
};

export function selectDevices(selection = process.env.DEVICES ?? (process.env.CI ? 'desktop,mobile' : 'chromium')): Project[] {
  const all = Object.values(DEVICE_GROUPS).flat();
  const picked = selection.split(',').map((s) => s.trim()).filter(Boolean).flatMap((key) => {
    const group = DEVICE_GROUPS[key];
    if (group) return group;
    const project = all.find((p) => p.name === key);
    if (!project) throw new Error(`Unknown DEVICES entry "${key}". Groups: ${Object.keys(DEVICE_GROUPS).join(', ')}; projects: ${all.map((p) => p.name).join(', ')}`);
    return [project];
  });
  return [...new Map(picked.map((p) => [p.name, p])).values()];
}
