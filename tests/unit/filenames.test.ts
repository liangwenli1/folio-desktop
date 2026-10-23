// Windows and macOS don't tell file names apart by case, so `./Api` can resolve to api.ts there and to Api.tsx on
// Linux. No two source files may share a name that differs only by case or extension.
import { readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { expect, it } from 'vitest';

it('no two source files differ only by case or extension', () => {
  const clashes: string[][] = [];
  const walk = (dir: string) => {
    const byName = new Map<string, string[]>();
    for (const e of readdirSync(dir, { withFileTypes: true })){
      if (e.isDirectory()) walk(join(dir, e.name));
      const key = (e.isDirectory() ? e.name : parse(e.name).name).toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), join(dir, e.name)]);
    }
    for (const files of byName.values()) if (files.length > 1) clashes.push(files);
  };
  for (const root of ['src', 'tests']) walk(root);
  expect(clashes).toEqual([]);
});
