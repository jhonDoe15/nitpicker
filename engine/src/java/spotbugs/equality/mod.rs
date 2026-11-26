//! Patterns about how a class defines equality: `equals` it inherits without looking at its own fields,
//! `compareTo` without `equals`, and an `equals` that casts its argument unchecked.
mod casts;
mod equals;

use super::Context;
use super::classes::Shape;

pub const PATTERNS: [&[&str]; 2] = [equals::PATTERNS, casts::PATTERNS];

pub fn check(context: &Context, shape: &Shape) {
    equals::check(context, shape);
    casts::check(context, shape);
}
