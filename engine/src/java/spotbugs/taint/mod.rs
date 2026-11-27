//! The taint layer that FindSecBugs' injection patterns share, rebuilt on the engine's flow graph from what
//! SpotBugs 4.9.8 with FindSecBugs 1.14.0 reports on test code. A value is safe, unknown or tainted; a sink is
//! reported at priority 1 for a tainted value, 2 for an unknown one, and not at all for a safe one.
//!
//! What the experiments show, and what this follows:
//! - Safe: literals (`null` too), compile-time constants, `+` of constants that the compiler folds, a new empty
//!   `StringBuilder`, collection or array, and what the measured JDK methods (`jdk-taint.tsv`) make of safe values.
//! - Unknown: parameters, `this`, instance fields, fields of other classes, results of methods with neither a
//!   table row nor a body in the run (library methods, interface and abstract methods), lambdas and the values
//!   their bodies capture, caught exceptions.
//! - Tainted: what the servlet request methods listed in the table return, and parameters marked
//!   `@RequestParam` or `@PathVariable`.
//! - A string `+` that the compiler does not fold is unknown whatever its parts are: javac compiles it to one
//!   `invokedynamic` call that the layer cannot see into, so a tainted part gives unknown too.
//! - Values are followed through locals, branches and loops (a merge keeps the worst), array elements, and the
//!   contents of builders and collections: appending to a builder or adding to a collection held in a local
//!   makes the local as bad as what was added, also through a chain of `append` calls. A copy of the local into
//!   another one is not changed by calls on the copy.
//! - A local handed to a method without a table row or a body in the run is unknown afterwards, unless it is a
//!   string, a boxed primitive or a primitive. The table says which JDK methods leave their arguments alone.
//! - A call to a method of the run with a body is worked out from that body: the result follows the parameters
//!   it comes from, and parameters the body appends to take what was appended. The body of the method the call
//!   names is used, not those of overriding methods. A call that goes round in a circle is unknown.
//! - A static field of the class being reported takes what its static initializer stores; one the initializer
//!   does not store is tainted when a method of the class stores a tainted value, otherwise unknown. Static fields
//!   read while working out a called method are unknown.
//! - A sink in a method that its parameter reaches is reported at priority 1 when some call in the run hands that
//!   parameter a tainted value, directly or through the parameters of other methods; `new`, `this(...)` and
//!   `super(...)` hand constructors their parameters the same way.
mod calls;
mod derived;
mod flow;
mod injection;
pub(crate) mod jdk;
pub mod lines;
mod sinks;
mod statics;

pub use calls::Summaries;
pub use derived::Derived;
pub use sinks::injections;

/// How bad a value is, worst last.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Level {
    #[default]
    Safe,
    Unknown,
    Tainted,
}

/// What a value is: its own level, and the parameters of the method being worked out that it also comes from.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Value {
    pub level: Level,
    /// A bit per parameter by position; `THIS` for the object the method runs on.
    pub params: u64,
}

/// The bit of `Value::params` for `this`.
pub const THIS: u64 = 1 << 63;

impl Value {
    pub const SAFE: Value = Value { level: Level::Safe, params: 0 };
    pub const UNKNOWN: Value = Value { level: Level::Unknown, params: 0 };
    pub const TAINTED: Value = Value { level: Level::Tainted, params: 0 };

    pub fn merge(self, other: Value) -> Value {
        Value { level: self.level.max(other.level), params: self.params | other.params }
    }

    /// The value at a call site of a method whose result or parameter is `self`, given what the call hands over.
    pub fn at(self, this: Value, arguments: &[Value]) -> Value {
        let mut found = Value { level: self.level, params: 0 };
        if self.params & THIS != 0 {
            found = found.merge(this);
        }
        for (position, argument) in arguments.iter().enumerate().take(63) {
            if self.params & (1 << position) != 0 {
                found = found.merge(*argument);
            }
        }
        found
    }
}
