#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

type ExportTarget = string | Record<string, ExportTarget>;

interface PackageJson {
  exports: Record<string, ExportTarget>;
  bin?: Record<string, string>;
  files?: string[];
}

interface PridepackConfig {
  entrypoints: Record<string, string>;
}

const root = resolve(__dirname, '..');
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as PackageJson;
const pridepack = JSON.parse(
  readFileSync(resolve(root, 'pridepack.json'), 'utf8'),
) as PridepackConfig;

const failures: string[] = [];

function checkFile(label: string, target: string, requireDotSlash = true): void {
  if (requireDotSlash && !target.startsWith('./')) {
    failures.push(`${label} must be a relative package path: ${target}`);
    return;
  }

  if (!requireDotSlash && (
    target.startsWith('/')
    || target.startsWith('\\')
    || /^[A-Za-z]:/.test(target)
    || target.split(/[\\/]/).includes('..')
  )) {
    failures.push(`${label} must stay within the package: ${target}`);
    return;
  }

  if (!existsSync(resolve(root, target))) {
    failures.push(`${label} points to a missing file: ${target}`);
  }
}

function checkExportTarget(label: string, target: ExportTarget): void {
  if (typeof target === 'string') {
    checkFile(label, target);
    return;
  }

  for (const [condition, nestedTarget] of Object.entries(target)) {
    checkExportTarget(`${label}.${condition}`, nestedTarget);
  }
}

for (const entrypoint of Object.keys(pridepack.entrypoints)) {
  if (!(entrypoint in packageJson.exports)) {
    failures.push(`Pridepack entrypoint ${entrypoint} is missing from package exports`);
  }
}

for (const [subpath, target] of Object.entries(packageJson.exports)) {
  checkExportTarget(`exports[${subpath}]`, target);
}

for (const [name, target] of Object.entries(packageJson.bin ?? {})) {
  checkFile(`bin.${name}`, target, false);

  if (/\.(?:cts|mts|ts|tsx)$/.test(target)) {
    failures.push(`bin.${name} must point to a Node-executable JavaScript launcher: ${target}`);
  }
}

for (const requiredDirectory of ['bin', 'dist', 'schemas']) {
  if (!packageJson.files?.includes(requiredDirectory)) {
    failures.push(`package files must include ${requiredDirectory}`);
  }
}

function verifyBinaries(): void {
  for (const [name, target] of Object.entries(packageJson.bin ?? {})) {
    if (!existsSync(resolve(root, target))) continue;

    const result = spawnSync(process.execPath, [resolve(root, target), '--help'], {
      cwd: root,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      failures.push(
        `bin.${name} failed its --help smoke test: ${result.stderr || result.stdout}`,
      );
    }
  }
}

async function verifyModuleLoading(): Promise<void> {
  const requireFromPackage = createRequire(resolve(root, 'package.json'));

  for (const subpath of Object.keys(pridepack.entrypoints)) {
    const specifier = subpath === '.'
      ? '@doeixd/machine'
      : `@doeixd/machine${subpath.slice(1)}`;

    try {
      requireFromPackage(specifier);
    } catch (error) {
      failures.push(`CommonJS could not load ${specifier}: ${String(error)}`);
    }

    try {
      await import(specifier);
    } catch (error) {
      failures.push(`ESM could not load ${specifier}: ${String(error)}`);
    }
  }
}

async function main(): Promise<void> {
  if (failures.length === 0) verifyBinaries();
  if (failures.length === 0) await verifyModuleLoading();

  if (failures.length > 0) {
    console.error('Package verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Verified ${Object.keys(pridepack.entrypoints).length} package exports ` +
    'with declarations, CommonJS loading, and ESM loading.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
