//! Test-code rules of the ESLint plugin on what tests share with each other: `no-fixed-port-in-tests`,
//! `no-uncleared-shared-mock` and `no-worker-state-in-concurrent-tests`.
pub mod fixed_port;
mod port_exemptions;
pub mod shared_mock;
pub mod worker_state;
