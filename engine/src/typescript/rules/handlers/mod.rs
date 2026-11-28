//! Rules about what route handlers take and return.
mod error_status;
mod fall_through;
mod handler_entity_type;
mod orm_entities;
mod routes;
pub mod walk;

pub use handler_entity_type::check as handler_entity_type;
pub use error_status::check as error_response_without_status;
pub use fall_through::check as send_without_return;
