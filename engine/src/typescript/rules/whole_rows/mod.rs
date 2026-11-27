//! Rules about queries that load whole rows for less than a row: one column, or whether a row exists.
mod boolean_uses;
mod column_uses;
pub mod no_whole_rows_for_one_value;
