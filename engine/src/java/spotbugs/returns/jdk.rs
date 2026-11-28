//! What SpotBugs knows about the JDK's methods for the return-value patterns. The table was measured by calling
//! every public method and constructor of `java.base` and of the other server-side modules under SpotBugs 4.9.8:
//! once with the result left unused, on a value typed as the class the call is made on, and once inside a method
//! that returns a constant, which SpotBugs then takes as having no side effect only when the call has none. A row
//! is the class the call is made on, the method, its erased parameters, what SpotBugs said, and the class it names
//! when that is not the class the call is made on: `i` its result is reported as ignored by
//! RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT, `p` the call has no side effect, `c` it is reported by
//! RV_RETURN_VALUE_IGNORED_BAD_PRACTICE at priority 2.
use crate::java::types::model::Type;
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Clone, Copy, Default)]
pub struct Known {
    pub ignored: bool,
    pub pure: bool,
    pub checked: bool,
    /// The class SpotBugs names for the method, when it is not the class the call is made on.
    pub named: Option<&'static str>,
}

type Key = (&'static str, &'static str, &'static str);

static TABLE: LazyLock<HashMap<Key, Known>> = LazyLock::new(|| {
    let mut table = HashMap::new();
    for line in include_str!("jdk-returns.tsv").lines() {
        let parts: Vec<&'static str> = line.split('\t').collect();
        let [flags, class, method, parameters, rest @ ..] = parts.as_slice() else { continue };
        let known = Known {
            ignored: flags.contains('i'),
            pure: flags.contains('p'),
            checked: flags.contains('c'),
            named: rest.first().copied(),
        };
        table.insert((*class, *method, *parameters), known);
    }
    table
});

/// A parameter type as the table writes it: the erased name, `[]` for each array dimension.
pub fn written(kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", written(element)),
        other => other.erased().name(),
    }
}

pub fn parameters(list: &[Type]) -> String {
    list.iter().map(written).collect::<Vec<_>>().join(",")
}

/// What SpotBugs knows about a call made on `class`.
pub fn known(class: &str, method: &str, parameters: &str) -> Option<Known> {
    TABLE.get(&(class, method, parameters)).copied()
}
