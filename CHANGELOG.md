# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Created `TODO.md` in repository root, extracted from `skilsmcp-spec.md`.
- Initialized project roadmap with 20 atomic tasks (T-001 to T-020).
- Created 20 GitHub issues corresponding to the project roadmap.
- This `CHANGELOG.md` to track project evolution.
- Root level linting and formatting configuration files (`.eslintrc.json`, `.prettierrc`, `pyproject.toml`).
- Git hooks configuration (via husky/lint-staged).
- CI workflow configuration (`.github/workflows/ci.yml`).

### Fixed

- Renamed `cleanbooks-spec.md` to `skillsmcp-spec.md` (via user instruction).

## [0.1.0] - 2026-01-28

### Added

- Initial project structure with `tools/skillshub` and `tools/skill-loader-*`.
- Core documentation: `README.md`, `CONTRIBUTING.md`, `LICENSE`.
- Basic CI workflows for linting and validation.
