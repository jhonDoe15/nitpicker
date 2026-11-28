//! What SpotBugs knows about the methods of the JDK's `java.base` without reading them: which results may be null
//! which are never null, and which parameters are dereferenced. The table was measured by calling every public method of `java.base`
//! in test code under SpotBugs 4.9.8, once with its result dereferenced and once per parameter with a value that
//! may be null; it lists the calls SpotBugs reported. A call is looked up by the class it is made on, then by the
//! classes and interfaces above it.
use crate::java::types::expr::Call;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::Type;
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Default)]
struct Table {
    returns: HashMap<(&'static str, &'static str, &'static str), ()>,
    never_null: HashMap<(&'static str, &'static str, &'static str), ()>,
    dereferences: HashMap<(&'static str, &'static str, &'static str), u64>,
}

static TABLE: LazyLock<Table> = LazyLock::new(|| {
    let mut table = Table::default();
    for line in include_str!("jdk-nulls.tsv").lines() {
        let parts: Vec<&'static str> = line.split('\t').collect();
        match parts.as_slice() {
            ["returns", class, method, parameters] => {
                table.returns.insert((class, method, parameters), ());
            }
            ["nonnull", class, method, parameters] => {
                table.never_null.insert((class, method, parameters), ());
            }
            ["dereferences", class, method, parameters, bits] => {
                table.dereferences.insert((class, method, parameters), bits.parse().unwrap_or(0));
            }
            _ => {}
        }
    }
    table
});

fn written(kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", written(element)),
        other => other.erased().name(),
    }
}

fn owners(index: &TypeIndex, call: &Call) -> Vec<String> {
    let on = match &call.receiver {
        Type::Class(name, _) if !call.method.is_static && call.method.name != "<init>" => name.clone(),
        _ => call.declaring.clone(),
    };
    index.lineage(&on).iter().cloned().collect()
}

fn found<T: Copy>(index: &TypeIndex, call: &Call, table: &HashMap<(&'static str, &'static str, &'static str), T>) -> Option<T> {
    let parameters = call.method.parameters.iter().map(written).collect::<Vec<_>>().join(",");
    let name = call.method.name.as_str();
    owners(index, call).iter().find_map(|owner| table.get(&(owner.as_str(), name, parameters.as_str())).copied())
}

/// Whether SpotBugs takes the result of a JDK method as possibly null.
pub fn returns_null(index: &TypeIndex, call: &Call) -> bool {
    found(index, call, &TABLE.returns).is_some()
}

/// `toString()` and `getClass()`: SpotBugs takes their result as never null on any object, also where a class of
/// the run overrides `toString`.
pub fn object_never_null(call: &Call) -> bool {
    !call.method.is_static && call.method.parameters.is_empty() && matches!(call.method.name.as_str(), "toString" | "getClass")
}

/// Whether SpotBugs takes the result of a JDK method as never null.
pub fn never_null(index: &TypeIndex, call: &Call) -> bool {
    found(index, call, &TABLE.never_null).is_some()
}

/// A bit per parameter of a JDK method that SpotBugs takes as dereferenced.
pub fn dereferenced(index: &TypeIndex, call: &Call) -> u64 {
    found(index, call, &TABLE.dereferences).unwrap_or(0)
}
