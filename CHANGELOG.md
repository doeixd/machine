# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.2.1](https://github.com/doeixd/machine/compare/v1.2.0...v1.2.1) (2026-02-03)


### Bug Fixes

* ensure literal tag narrowing in tag.factory ([96bc03a](https://github.com/doeixd/machine/commit/96bc03aaf8c2ade5b5b6373ebbd784458a175ad0))

## [1.2.0](https://github.com/doeixd/machine/compare/v1.1.0...v1.2.0) (2026-02-03)


### Features

* add States ergonomic type utility and tag helpers documentation ([dd92071](https://github.com/doeixd/machine/commit/dd9207130f5b2d6f6ef4cf49cf6154446a5544c9))

## [1.1.0](https://github.com/doeixd/machine/compare/v1.0.3...v1.1.0) (2026-02-03)


### Features

* refine type inference, consolidate architecture, and add submodules ([5ccc250](https://github.com/doeixd/machine/commit/5ccc25016075279e0bc90d5d5cf2fa4433a144f5))

### [1.0.3](https://github.com/doeixd/machine/compare/v1.0.2...v1.0.3) (2026-01-30)

### [1.0.2](https://github.com/doeixd/machine/compare/v1.0.1...v1.0.2) (2026-01-13)


### Bug Fixes

* normalize machine bindings and context helpers ([df42dbc](https://github.com/doeixd/machine/commit/df42dbc1b31a4baf2b2b16516137bd98056a0eff))

### [1.0.1](https://github.com/doeixd/machine/compare/v0.0.23...v1.0.1) (2026-01-13)


### ⚠ BREAKING CHANGES

* transitions now read state via this.context and middleware/ensemble helpers no longer call
  transitions with raw contexts.

### Features

* Add comprehensive documentation for the Actor Model, covering its concepts, API, and comparison with runners. ([484a689](https://github.com/doeixd/machine/commit/484a689ab74a104d8546edbeb93e9cb661f45351))
* add context-bound helpers ([84719c0](https://github.com/doeixd/machine/commit/84719c08b59b2780ab204f80262e0c343b834a3c))
* migrate docs and helpers to this.context binding ([b159ff9](https://github.com/doeixd/machine/commit/b159ff9dd8bdd520e397ef624a5e8b8be0cc3354))

## [1.0.0](https://github.com/doeixd/machine/compare/v0.0.23...v1.0.0) (2026-01-13)


### ⚠ BREAKING CHANGES

* transitions now read state via this.context and middleware/ensemble helpers no longer call
  transitions with raw contexts.

### Features

* Add comprehensive documentation for the Actor Model, covering its concepts, API, and comparison with runners. ([484a689](https://github.com/doeixd/machine/commit/484a689ab74a104d8546edbeb93e9cb661f45351))
* migrate docs and helpers to this.context binding ([597bb1f](https://github.com/doeixd/machine/commit/597bb1f29beeaeda4bb9901d884746adcb56bfd0))

### [0.0.23](https://github.com/doeixd/machine/compare/v0.0.22...v0.0.23) (2025-12-16)


### Features

* add Actor Model documentation and React integration entry point ([5069cca](https://github.com/doeixd/machine/commit/5069cca403652270e2a55d57669ed7dcfe1bba8f))

### [0.0.22](https://github.com/doeixd/machine/compare/v0.0.21...v0.0.22) (2025-12-16)


### Features

* Add machine union and exclusion mixins for combining and excluding machine behaviors. ([385453d](https://github.com/doeixd/machine/commit/385453df174723f82c6a50d7b3d0ab179a14797b))

### [0.0.21](https://github.com/doeixd/machine/compare/v0.0.20...v0.0.21) (2025-12-16)


### Features

* Implement a new type-safe state machine library with actor model and React bindings. ([ca89e72](https://github.com/doeixd/machine/commit/ca89e7237b66919f53718afbfa377f4bf99b4864))

### [0.0.20](https://github.com/doeixd/machine/compare/v0.0.19...v0.0.20) (2025-12-16)


### Features

* Add `createMatcher` utility for type-safe pattern matching in state machines with comprehensive documentation and tests. ([4afa30c](https://github.com/doeixd/machine/commit/4afa30c8ab814d8a6dafbbaf55b7d516e96e0075))

### [0.0.19](https://github.com/doeixd/machine/compare/v0.0.18...v0.0.19) (2025-12-16)


### Features

* implement advanced pattern matching for state machines ([2f0f894](https://github.com/doeixd/machine/commit/2f0f894dd127e609be7966e0751b37620fcc8001))

### [0.0.18](https://github.com/doeixd/machine/compare/v0.0.17...v0.0.18) (2025-12-05)


### Features

* Introduce generator-based utilities for imperative state machine composition and control flow. ([32bcd9f](https://github.com/doeixd/machine/commit/32bcd9f91d62d996c26d162fe109293dceb57804))

### [0.0.17](https://github.com/doeixd/machine/compare/v0.0.16...v0.0.17) (2025-11-21)


### Features

* add GitHub Actions workflow for npm publish and release, and a functional test for createMachine. ([871d39a](https://github.com/doeixd/machine/commit/871d39a9f7559548f994247dd529b5c6894ef48e))

### [0.0.16](https://github.com/doeixd/machine/compare/v0.0.15...v0.0.16) (2025-11-21)

### [0.0.15](https://github.com/doeixd/machine/compare/v0.0.14...v0.0.15) (2025-11-20)

### [0.0.14](https://github.com/doeixd/machine/compare/v0.0.13...v0.0.14) (2025-11-20)


### Bug Fixes

* types ([a5fb9f6](https://github.com/doeixd/machine/commit/a5fb9f653e43ad023b146213527dc7c2a0940ecd))

### [0.0.13](https://github.com/doeixd/machine/compare/v0.0.12...v0.0.13) (2025-11-17)


### Features

* added state ([f39c6d2](https://github.com/doeixd/machine/commit/f39c6d22f18150cf55fee223d2391e792708439b))

### [0.0.12](https://github.com/doeixd/machine/compare/v0.0.11...v0.0.12) (2025-11-17)


### Features

* combinators ([cb8b41b](https://github.com/doeixd/machine/commit/cb8b41b1d5a00e03fd4546f6c58b50ee1ccacbcf))

### [0.0.11](https://github.com/doeixd/machine/compare/v0.0.10...v0.0.11) (2025-11-17)

### [0.0.10](https://github.com/doeixd/machine/compare/v0.0.8...v0.0.10) (2025-11-17)


### Features

* extract command ([69edd38](https://github.com/doeixd/machine/commit/69edd38c655954dc616684237f3cae7e65cfe17d))

### [0.0.8](https://github.com/doeixd/machine/compare/v0.0.7...v0.0.8) (2025-11-17)

### [0.0.7](https://github.com/doeixd/machine/compare/v0.0.6...v0.0.7) (2025-11-14)

### [0.0.6](https://github.com/doeixd/machine/compare/v0.0.5...v0.0.6) (2025-11-14)

### [0.0.5](https://github.com/doeixd/machine/compare/v0.0.4...v0.0.5) (2025-11-14)

### [0.0.4](https://github.com/doeixd/machine/compare/v0.0.3...v0.0.4) (2025-11-14)

### [0.0.3](https://github.com/doeixd/machine/compare/v0.0.2...v0.0.3) (2025-11-14)

### [0.0.2](https://github.com/doeixd/machine/compare/v0.0.1...v0.0.2) (2025-11-14)

### 0.0.1 (2025-11-14)
