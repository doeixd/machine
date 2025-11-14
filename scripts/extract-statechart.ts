#!/usr/bin/env tsx
/**
 * @file CLI tool for extracting statecharts from machine definitions
 * @description
 * Command-line interface for the @doeixd/machine statechart extraction system.
 * Supports:
 * - Single or multiple machine extraction
 * - Config file support (.statechart.config.ts)
 * - Watch mode for development
 * - JSON validation against XState schema
 * - Multiple output formats (JSON, Mermaid)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import chokidar from 'chokidar';
import {
  extractMachine,
  extractMachines,
  type MachineConfig,
  type ExtractionConfig,
} from '../src/extract';
import { Project } from 'ts-morph';

// =============================================================================
// CLI PROGRAM SETUP
// =============================================================================

const program = new Command();

program
  .name('extract-statechart')
  .description('Extract statechart definitions from TypeScript state machines')
  .version('1.0.0');

program
  .option('-i, --input <file>', 'Input file containing machine definitions')
  .option('-o, --output <file>', 'Output file for the generated statechart')
  .option('-c, --config <file>', 'Configuration file path', '.statechart.config.ts')
  .option('-w, --watch', 'Watch mode - regenerate on file changes')
  .option('-f, --format <type>', 'Output format: json, mermaid, or both', 'json')
  .option('--validate', 'Validate output against XState JSON schema')
  .option('-v, --verbose', 'Verbose logging')
  .option('--id <id>', 'Machine ID (required with --input)')
  .option('--classes <classes>', 'Comma-separated list of class names (required with --input)')
  .option('--initial <state>', 'Initial state class name (required with --input)');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Converts a file path to a file:// URL compatible with dynamic import
 */
function pathToFileURL(filePath: string): string {
  // On Windows, convert backslashes and add file:// protocol
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return `file:///${normalized}`;
}

/**
 * Loads configuration from a TypeScript or JSON file
 */
async function loadConfig(configPath: string): Promise<ExtractionConfig | null> {
  const resolvedPath = path.resolve(process.cwd(), configPath);

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  console.error(chalk.blue(`📄 Loading config from: ${resolvedPath}`));

  // For TypeScript files, use dynamic import
  if (resolvedPath.endsWith('.ts')) {
    try {
      // Convert to file:// URL for proper import on Windows
      const fileUrl = pathToFileURL(resolvedPath);
      const config = await import(fileUrl);
      return config.default || config;
    } catch (error) {
      console.error(chalk.red(`❌ Error loading config file:`), error);
      return null;
    }
  }

  // For JSON files, use fs
  if (resolvedPath.endsWith('.json')) {
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(chalk.red(`❌ Error parsing JSON config:`), error);
      return null;
    }
  }

  console.error(chalk.yellow(`⚠️ Unsupported config file format: ${resolvedPath}`));
  return null;
}

/**
 * Writes output to file or stdout
 */
function writeOutput(data: any, outputPath?: string, format: string = 'json'): void {
  let output: string;

  switch (format) {
    case 'json':
      output = JSON.stringify(data, null, 2);
      break;
    case 'mermaid':
      output = generateMermaid(data);
      break;
    default:
      output = JSON.stringify(data, null, 2);
  }

  if (outputPath) {
    const resolvedPath = path.resolve(process.cwd(), outputPath);
    const dir = path.dirname(resolvedPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, output, 'utf-8');
    console.error(chalk.green(`✅ Statechart written to: ${resolvedPath}`));
  } else {
    // Write to stdout
    console.log(output);
  }
}

/**
 * Generates Mermaid diagram from statechart
 * (Basic implementation - can be enhanced)
 */
function generateMermaid(chart: any): string {
  const lines: string[] = [
    'stateDiagram-v2',
    `  [*] --> ${chart.initial}`,
  ];

  for (const [stateName, stateNode] of Object.entries(chart.states as any)) {
    const node = stateNode as any;

    // Add transitions
    for (const [event, transition] of Object.entries(node.on || {})) {
      const trans = transition as any;
      const label = trans.description ? `${event}: ${trans.description}` : event;
      lines.push(`  ${stateName} --> ${trans.target} : ${label}`);
    }
  }

  return lines.join('\n');
}

/**
 * Validates statechart against XState JSON schema
 * (Placeholder - needs actual schema and ajv integration)
 */
function validateStatechart(chart: any): boolean {
  // TODO: Implement actual validation with ajv and XState schema
  console.error(chalk.yellow('⚠️ Validation not yet implemented'));

  // Basic structure validation
  if (!chart.id || !chart.initial || !chart.states) {
    console.error(chalk.red('❌ Invalid statechart structure'));
    return false;
  }

  return true;
}

/**
 * Extracts machines based on CLI options or config
 */
async function extract(options: any): Promise<void> {
  const verbose = options.verbose || false;

  // Try loading config file first
  let config: ExtractionConfig | null = null;

  if (options.config) {
    config = await loadConfig(options.config);
  }

  // If no config and no input, error
  if (!config && !options.input) {
    console.error(chalk.red('❌ Error: Either --config or --input must be provided'));
    console.error(chalk.gray('  Use --config to specify a config file'));
    console.error(chalk.gray('  Or use --input, --id, --classes, and --initial for a single machine'));
    process.exit(1);
  }

  // If input is provided via CLI, create a single-machine config
  if (options.input) {
    if (!options.id || !options.classes || !options.initial) {
      console.error(chalk.red('❌ Error: --input requires --id, --classes, and --initial'));
      process.exit(1);
    }

    const machineConfig: MachineConfig = {
      input: options.input,
      classes: options.classes.split(',').map((s: string) => s.trim()),
      id: options.id,
      initialState: options.initial,
      output: options.output,
    };

    config = {
      machines: [machineConfig],
      verbose,
      format: options.format,
      validate: options.validate,
    };
  }

  if (!config) {
    console.error(chalk.red('❌ Error: Failed to load configuration'));
    process.exit(1);
  }

  // Update config with CLI options (CLI overrides config file)
  if (options.verbose !== undefined) config.verbose = options.verbose;
  if (options.format) config.format = options.format;
  if (options.validate !== undefined) config.validate = options.validate;

  // Extract machines
  try {
    if (verbose) {
      console.error(chalk.blue('\n🚀 Starting extraction...\n'));
    }

    const results = extractMachines(config);

    // Validate if requested
    if (config.validate) {
      for (const chart of results) {
        if (!validateStatechart(chart)) {
          console.error(chalk.red(`❌ Validation failed for machine: ${chart.id}`));
          process.exit(1);
        }
      }
    }

    // Write outputs
    if (config.machines.length === 1 && config.machines[0].output) {
      // Single machine with specified output
      writeOutput(results[0], config.machines[0].output, config.format || 'json');
    } else if (config.machines.length === 1 && options.output) {
      // Single machine with CLI output option
      writeOutput(results[0], options.output, config.format || 'json');
    } else {
      // Multiple machines - write each to its own file or stdout
      for (let i = 0; i < results.length; i++) {
        const chart = results[i];
        const machineConfig = config.machines[i];

        if (machineConfig.output) {
          writeOutput(chart, machineConfig.output, config.format || 'json');
        } else {
          // If no output specified, write to stdout (only for single machine)
          if (results.length === 1) {
            writeOutput(chart, undefined, config.format || 'json');
          } else {
            // For multiple machines without output paths, generate default names
            const defaultOutput = `statecharts/${chart.id}.json`;
            writeOutput(chart, defaultOutput, config.format || 'json');
          }
        }
      }
    }

    if (verbose) {
      console.error(chalk.green(`\n✅ Extraction complete!`));
    }
  } catch (error) {
    console.error(chalk.red('❌ Extraction failed:'), error);
    process.exit(1);
  }
}

/**
 * Watch mode - regenerate on file changes
 */
async function watch(options: any): Promise<void> {
  console.error(chalk.blue('👀 Watch mode enabled - watching for file changes...\n'));

  // Initial extraction
  await extract(options);

  // Load config to determine which files to watch
  const config = options.config ? await loadConfig(options.config) : null;

  const filesToWatch: string[] = [];

  if (config) {
    for (const machine of config.machines) {
      filesToWatch.push(path.resolve(process.cwd(), machine.input));
    }
    // Also watch the config file itself
    filesToWatch.push(path.resolve(process.cwd(), options.config));
  } else if (options.input) {
    filesToWatch.push(path.resolve(process.cwd(), options.input));
  }

  // Set up watcher
  const watcher = chokidar.watch(filesToWatch, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', async (filePath) => {
    console.error(chalk.yellow(`\n🔄 File changed: ${filePath}`));
    console.error(chalk.blue('  Re-extracting...\n'));

    try {
      await extract(options);
      console.error(chalk.green('  ✅ Re-extraction complete\n'));
    } catch (error) {
      console.error(chalk.red('  ❌ Re-extraction failed:'), error);
    }
  });

  console.error(chalk.gray('  Press Ctrl+C to stop watching\n'));
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

program.action(async (options) => {
  try {
    if (options.watch) {
      await watch(options);
    } else {
      await extract(options);
    }
  } catch (error) {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  }
});

// Parse arguments and run
program.parse();
