//! Rules about scheduled and queue jobs: their loops over items, the job handlers and the effects of an item.
pub mod item_work;
pub mod job_kinds;
pub mod no_unisolated_job_loop;
