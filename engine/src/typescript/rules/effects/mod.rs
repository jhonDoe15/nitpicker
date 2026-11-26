//! The effects analysis of the input/output rules: what a call does (a database query, a remote call, a
//! published message, a cache access, a write) and through which calls, following the project's own functions
//! across files on the compiler's trees.
pub mod callees;
pub mod flow;
pub mod packages;
pub mod summaries;
pub mod tags;
pub mod views;

/// `describePath`: "`a()`, which calls `b()`".
pub fn describe_path(path: &[String]) -> String {
    path.iter().map(|label| format!("`{label}`")).collect::<Vec<_>>().join(", which calls ")
}
