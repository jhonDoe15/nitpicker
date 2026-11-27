//! The ESTree side the query-row rules share: which awaited calls load rows through an ORM, where the loaded
//! rows are read, and the reads that only change, delete or pick one field of every row.
pub mod assignments;
pub mod calls;
pub mod loaded;
pub mod writes;
