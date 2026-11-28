//! Patterns about how a class defines equality: `equals` it inherits without looking at its own fields,
//! `compareTo` without `equals`, an `equals` that casts its argument unchecked, and one that tests it for an
//! incompatible type.
mod casts;
mod equals;
mod incompatible;

use super::Context;
use super::classes::Shape;

pub const PATTERNS: [&[&str]; 3] = [equals::PATTERNS, casts::PATTERNS, incompatible::PATTERNS];

pub fn check(context: &Context, shape: &Shape) {
    equals::check(context, shape);
    casts::check(context, shape);
    incompatible::check(context, shape);
}
