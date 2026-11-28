//! Test-code rules of the ESLint plugin on what a test file takes from its surroundings: the real clock, randomness
//! and network, the production code it imports or mocks, and whether the runner collects it at all:
//! `no-real-time-random-or-network`, `no-wall-clock-bound-in-tests`, `no-mocking-subject-under-test`,
//! `no-production-imports-in-setup-files` and `no-uncollected-tests`.
pub mod mocked_subject;
pub mod real_world;
pub mod setup_imports;
pub mod uncollected;
pub mod wall_clock;
