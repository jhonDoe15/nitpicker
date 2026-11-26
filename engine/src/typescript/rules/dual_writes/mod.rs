//! `no-dual-write`: a function that writes to the database and publishes a message, and the helpers it rests on:
//! relay loops, writes committed before the publish, and the program's message brokers.
pub mod no_dual_write;
mod publishers;
mod relays;
mod sites;
