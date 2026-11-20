//! Which types SpotBugs takes for mutable: arrays, and classes that declare or inherit a setter-like instance method.
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Type, flag, setter_name};

const IMMUTABLE_CLASSES: &[&str] = &[
    "java.lang.String", "java.lang.Class", "java.lang.ClassLoader", "java.io.File", "java.awt.Cursor", "java.awt.Font",
    "java.net.Inet4Address", "java.net.Inet6Address", "java.net.InetSocketAddress", "java.net.URI", "java.net.URL",
    "java.util.Locale", "java.util.regex.Pattern", "java.time.chrono.HijrahDate", "java.time.chrono.JapaneseDate",
    "java.time.chrono.MinguoDate", "java.time.chrono.ThaiBuddhistDate",
];
const IMMUTABLE_PACKAGES: &[&str] = &["java.math", "java.time"];
const IMMUTABLE_PREFIXES: &[&str] = &["com.google.common.collect.Immutable"];

pub fn mutable(index: &TypeIndex, kind: &Type) -> bool {
    match kind {
        Type::Array(_) => true,
        Type::Class(name, _) => mutable_class(index, name.split('&').next().unwrap_or(name)),
        _ => false,
    }
}

fn mutable_class(index: &TypeIndex, name: &str) -> bool {
    if IMMUTABLE_CLASSES.contains(&name) || IMMUTABLE_PREFIXES.iter().any(|prefix| name.starts_with(prefix)) {
        return false;
    }
    let Some(info) = index.get(name) else { return false };
    if IMMUTABLE_PACKAGES.contains(&info.package.as_str()) || info.flags & (flag::ENUM | flag::RECORD) != 0 {
        return false;
    }
    let mut current = Some(info);
    let mut steps = 0;
    while let Some(class) = current {
        if class.setter_like || bridged(index, class) {
            return true;
        }
        steps += 1;
        current = class.superclass.as_deref().filter(|_| steps < 64).and_then(|parent| index.get(parent));
    }
    false
}

/// A setter-like method that returns its own class counts after all when it overrides one with another return
/// type: the compiler then adds a bridge method with that other return type.
fn bridged(index: &TypeIndex, class: &ClassInfo) -> bool {
    let own = Type::class(&class.name);
    let fluent: Vec<_> = class.methods.iter().filter(|method| !method.is_static && setter_name(&method.name) && method.returns == own).collect();
    if fluent.is_empty() {
        return false;
    }
    let mut seen = std::collections::HashSet::new();
    let mut open: Vec<&str> = class.superclass.iter().chain(&class.interfaces).map(String::as_str).collect();
    while let Some(name) = open.pop() {
        let Some(above) = index.get(name).filter(|_| seen.insert(name)) else { continue };
        let differs = above.methods.iter().any(|base| {
            !base.is_static && fluent.iter().any(|method| method.name == base.name && method.parameters.len() == base.parameters.len() && method.returns != base.returns)
        });
        if differs {
            return true;
        }
        open.extend(above.superclass.iter().chain(&above.interfaces).map(String::as_str));
    }
    false
}
