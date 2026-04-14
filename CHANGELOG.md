# Changelog

## v1.1.0 - 2026-04-15

### Added

- Added broader frosted workspace polish across detail pages, dialogs, and create flows.
- Added stronger smoke and visual coverage for the updated dashboard workspaces.

### Changed

- Updated restore operations to run offline only from the CLI restore path.
- Updated operator documentation for restore handling, Telegram webhook secret enforcement, and fresh VPS bootstrap behavior.

### Fixed

- Fixed Telegram webhook setup and inbound secret validation behavior.
- Fixed owner-only enforcement for subscription settings and restore-related admin controls.
- Fixed fresh VPS bootstrap to use the non-interactive Prisma safety wrapper instead of hanging on a confirmation prompt.
