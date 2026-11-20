//! Type questions answered by the TypeScript compiler's own API server (`tsc --api`, TypeScript 7 and later).
//! The engine keeps its own tree and rule logic; only the questions a rule has about types go over the pipe.
pub mod channel;
pub mod nodes;
pub mod server;
