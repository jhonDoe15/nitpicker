//! The methods whose result ReturnValueIgnored wants used: Error Prone's `SPECIALIZED_MATCHER`.
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{Method, Type};

const SAME_TYPE: [&str; 3] = ["java.math.BigInteger", "java.math.BigDecimal", "java.nio.file.Path"];
const BOXES: [&str; 8] =
    ["java.lang.Boolean", "java.lang.Byte", "java.lang.Character", "java.lang.Double", "java.lang.Float", "java.lang.Integer", "java.lang.Long", "java.lang.Short"];
const OBJECTS_ALLOWED: [&str; 6] = ["checkFromIndexSize", "checkFromToIndex", "checkIndex", "requireNonNull", "requireNonNullElse", "requireNonNullElseGet"];
const EXACT_ANY: [&str; 7] = [
    "java.lang.CharSequence", "java.util.stream.Collector", "java.util.stream.Collectors", "java.lang.Enum", "java.util.Optional", "java.lang.String",
    "java.util.concurrent.TimeUnit",
];

fn parameters(method: &Method, names: &[&str]) -> bool {
    method.parameters.len() == names.len() && method.parameters.iter().zip(names).all(|(kind, name)| kind.name() == *name)
}

fn parsing(method: &Method, receiver: &str) -> bool {
    let name = method.name.as_str();
    if !method.is_static {
        return false;
    }
    (receiver == "java.lang.Character" && matches!(name, "toChars" | "codePointCount"))
        || name == "decode"
        || (name.starts_with("parse") && name[5..].chars().all(|letter| ('A'..='z').contains(&letter)))
        || (name == "valueOf" && (parameters(method, &["java.lang.String"]) || parameters(method, &["java.lang.String", "int"])))
}

/// `java.time` methods that may be called for their checks or their builders.
fn time_allowed(method: &Method, receiver: &str) -> bool {
    let name = method.name.as_str();
    let on = |classes: [&str; 2]| classes.contains(&receiver);
    name == "parse"
        || (method.is_static && matches!(name, "of" | "from"))
        || (method.is_static && name == "ofOffset" && on(["java.time.ZoneId", "org.threeten.bp.ZoneId"]))
        || (!method.is_static
            && on(["java.time.format.DateTimeFormatterBuilder", "org.threeten.bp.format.DateTimeFormatterBuilder"])
            && ["append", "parse", "pad", "optional"].iter().any(|start| name.starts_with(start)))
        || (!method.is_static && on(["java.time.temporal.ChronoField", "org.threeten.bp.temporal.ChronoField"]) && matches!(name, "checkValidIntValue" | "checkValidValue"))
        || (!method.is_static && on(["java.time.temporal.ValueRange", "org.threeten.bp.temporal.ValueRange"]) && name == "checkValidValue")
}

/// Whether the method, called on a value of the type `receiver` and declared in `declaring` (a class of the package
/// `package`), is one whose result must be used. `file_package` is the package of the file that makes the call.
pub fn expected(index: &TypeIndex, receiver: &str, declaring: &str, package: &str, method: &Method, file_package: &str) -> bool {
    let name = method.name.as_str();
    let under = |above: &str| index.is_subtype(receiver, above);
    let simple = method.is_static;
    let none = method.parameters.is_empty();
    if EXACT_ANY.contains(&receiver) {
        return true;
    }
    match (simple, receiver) {
        (true, "java.util.Arrays") => return true,
        (true, "java.util.Map.Entry") => return true,
        (true, "java.util.Map") if matches!(name, "of" | "copyOf" | "entry" | "ofEntries") => return true,
        (true, "java.util.Objects") if !OBJECTS_ALLOWED.contains(&name) => return true,
        _ => {}
    }
    if BOXES.contains(&receiver) && !parsing(method, receiver) {
        return true;
    }
    if receiver == "java.lang.Class" && !(method.is_static && name == "forName") && !(!method.is_static && name == "getMethod") {
        return true;
    }
    if SAME_TYPE.contains(&receiver) && method.returns.name() == receiver && !matches!(method.returns, Type::Primitive(_)) {
        return true;
    }
    if package == "java.util.function" {
        return true;
    }
    let in_time = |name: &str| name.starts_with("java.time") || name.starts_with("org.threeten.bp");
    if in_time(package) && !in_time(file_package) && method.detail.access & 1 != 0 && !time_allowed(method, receiver) {
        return true;
    }
    if simple {
        return name == "newBuilder" && under("com.google.protobuf.MessageLite");
    }
    let flat = |class: &str| under(class);
    (flat("java.util.Collection")
        && match name {
            "contains" => parameters(method, &["java.lang.Object"]),
            "containsAll" => parameters(method, &["java.util.Collection"]),
            "isEmpty" | "size" | "stream" => none,
            "toArray" => none || parameters(method, &["java.util.function.IntFunction"]),
            _ => false,
        })
        || (flat("java.lang.Iterable") && matches!(name, "iterator" | "spliterator") && none)
        || (flat("java.util.Iterator") && name == "hasNext" && none)
        || (flat("org.joda.time.ReadableInstant") && name == "getMillis" && none)
        || (flat("org.joda.time.ReadableDuration") && name == "getMillis" && none)
        || (flat("java.util.Map.Entry") && matches!(name, "getKey" | "getValue"))
        || (flat("java.util.Map")
            && match name {
                "containsKey" | "containsValue" => parameters(method, &["java.lang.Object"]),
                "isEmpty" | "size" | "entrySet" | "keySet" | "values" => true,
                _ => false,
            })
        || (matches!(name, "getClass" | "hashCode" | "clone" | "toString") && none)
        || (name == "equals" && parameters(method, &["java.lang.Object"]))
        || (flat("com.google.protobuf.MessageLite.Builder") && matches!(name, "build" | "buildPartial"))
        || flat("java.util.stream.BaseStream")
        || (flat("java.lang.Throwable") && matches!(name, "getCause" | "getLocalizedMessage" | "getMessage" | "getStackTrace" | "getSuppressed"))
}
