//! The timeout rules: `require-http-timeout` for outbound HTTP calls and `require-client-timeout` for database and
//! AWS SDK clients, with the option readers they share.
pub mod clients;
mod config;
pub mod http;
