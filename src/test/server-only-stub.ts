// Vitest runs outside Next's "react-server" bundler condition, so the
// real `server-only` package (which throws unconditionally under plain
// Node) is aliased to this no-op for tests. Production code still gets
// Next's real enforcement at build time.
export {};
