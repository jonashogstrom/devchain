# Local App

The Local App is DevChain's local-first NestJS and React/Vite application. It manages the SQLite-backed workspace, tmux/PTY sessions, MCP tools, and the browser UI.

Storage is local-only: `StorageModule` binds `STORAGE_SERVICE` to the singleton `LocalStorageService` (`src/modules/storage/storage.module.ts`; locked by `src/modules/storage/storage.binding.spec.ts`). No Remote API storage adapter is registered.

## Read next

- [Local development](DEV.md) — app-scoped development workflow, ports, and build output.
- [Repository setup](../../docs/setup.md) — first checkout and launcher setup.
- [Repository operations](../../docs/operations.md) — canonical commands, environment variables, and maintenance procedures.
- [Repository architecture](../../docs/architecture.md) — subsystem and runtime models.
- [Test helpers](test/helpers/README.md) — integration fixture contracts.
- [Memory-soak runbook](scripts/memory-soak/README.md) — memory validation and evidence capture.
