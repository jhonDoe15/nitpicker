//! Rules about what route handlers take and return.
mod handler_entity_type;
mod orm_entities;
mod routes;

pub use handler_entity_type::check as handler_entity_type;
