//! What FindSecBugs makes of JDK and servlet methods, from `jdk-taint.tsv`: one row per method, measured by
//! running SpotBugs with FindSecBugs on lab code that hands each method safe and unknown values.
use super::{THIS, Value};
use crate::java::types::index::TypeIndex;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::OnceLock;

pub struct Row {
    /// What the result is: a fixed level, merged with the receiver (`THIS`) and the arguments the bits name.
    pub result: Value,
    /// A call on a local makes the local take the result: `append` on a builder, `add` on a list.
    pub mutates: bool,
    /// Arguments of mutable types are unknown afterwards.
    pub spoils: bool,
}

type Key = (String, String, String);

fn rows() -> &'static HashMap<Key, Row> {
    static ROWS: OnceLock<HashMap<Key, Row>> = OnceLock::new();
    ROWS.get_or_init(|| {
        let mut rows = HashMap::new();
        for line in include_str!("jdk-taint.tsv").lines().filter(|line| !line.starts_with('#') && !line.is_empty()) {
            let parts: Vec<&str> = line.split('\t').collect();
            let [owner, name, parameters, result, flags] = parts[..] else { continue };
            let value = result.split('+').fold(Value::SAFE, |value, part| match part {
                "tainted" => value.merge(Value::TAINTED),
                "unknown" => value.merge(Value::UNKNOWN),
                "this" => Value { params: value.params | THIS, ..value },
                arg if arg.starts_with("arg") => Value { params: value.params | 1 << arg[3..].parse::<u32>().unwrap_or(0), ..value },
                _ => value,
            });
            let row = Row { result: value, mutates: flags.contains("mutates"), spoils: flags.contains("spoils") };
            rows.insert((owner.to_string(), name.to_string(), parameters.to_string()), row);
        }
        rows
    })
}

/// The row for a method named on a value of class `start`, looked up on that class and then on its superclasses
/// and interfaces, nearest first. `parameters` are the erased parameter types, comma separated.
pub fn row(index: &TypeIndex, start: &str, name: &str, parameters: &str) -> Option<&'static Row> {
    let rows = rows();
    let mut pending = VecDeque::from([start.to_string()]);
    let mut seen = HashSet::new();
    while let Some(class) = pending.pop_front() {
        if !seen.insert(class.clone()) {
            continue;
        }
        if let Some(row) = rows.get(&(class.clone(), name.to_string(), parameters.to_string())) {
            return Some(row);
        }
        if let Some(info) = index.get(&class) {
            pending.extend(info.superclass.iter().cloned());
            pending.extend(info.interfaces.iter().cloned());
        }
    }
    None
}
