#!/usr/bin/env node

// Register TypeScript support before loading the CLI. Keeping this launcher as
// plain CommonJS lets npm create a portable executable on every supported Node
// version while the CLI and TypeScript config files continue to run through tsx.
require('tsx/cjs');
require('../scripts/extract-statechart.ts');
