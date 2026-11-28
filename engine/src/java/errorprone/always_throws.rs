//! AlwaysThrows and NewFileSystem: calls that fail at runtime whatever happens before them. AlwaysThrows asks the
//! engine's models of the JDK parsers (`jdk_parse`) what the call with a constant argument throws.
use super::Context;
use super::already_pure::Constants;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::java_text::{double_to_string, float_to_string};
use super::jdk_parse::failure;
use super::owners::receiver_name;
use super::positions::{arguments, preferred};
use crate::engine::source::parent;
use crate::java::types::model::Method;
use crate::java::types::project::jdk_major;
use tree_sitter::Node;

const PARSED: [&str; 12] = [
    "java.time.Duration", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime",
    "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Period", "java.time.Year",
    "java.time.YearMonth", "java.time.ZonedDateTime",
];
const MAP: &str = "com.google.common.collect.ImmutableMap";
const BI_MAP: &str = "com.google.common.collect.ImmutableBiMap";

fn name<'c>(context: &'c Context, call: Node) -> &'c str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

fn parameters(method: &Method) -> Vec<String> {
    method.parameters.iter().map(|parameter| parameter.erased().name()).collect()
}

/// The method of the call when its name is one of the names and its receiver class passes the test.
fn matched(context: &Context, call: Node, is_static: bool, names: &[&str], class: impl Fn(&str) -> bool) -> Option<Method> {
    if call.kind() != "method_invocation" || !names.contains(&name(context, call)) {
        return None;
    }
    let owner = receiver_name(context, call, is_static)?;
    class(&owner).then(|| context.resolver.resolve_call(call).map(|resolved| resolved.method)).flatten()
}

fn is_put(context: &Context, call: Node, owner: &str) -> bool {
    let objects = ["java.lang.Object".to_string(), "java.lang.Object".to_string()];
    let builder = format!("{owner}.Builder");
    matched(context, call, false, &["put"], |class| context.resolver.index.is_subtype(class, &builder))
        .is_some_and(|method| parameters(&method) == objects)
}

fn is_of(context: &Context, call: Node, owner: &str) -> bool {
    matched(context, call, true, &["of"], |class| context.resolver.index.is_subtype(class, owner)).is_some()
}

/// A key as Error Prone's multiset holds it: what tells keys apart, how the key prints, and the hash code of a literal.
struct Key {
    id: String,
    shown: String,
    hash: Option<i32>,
}

fn java_hash(value: &Const) -> i32 {
    match value {
        Const::Int(value) => *value,
        Const::Long(value) => (*value ^ ((*value as u64) >> 32) as i64) as i32,
        Const::Float(value) => if value.is_nan() { 0x7fc0_0000 } else { value.to_bits() as i32 },
        Const::Double(value) => {
            let bits = if value.is_nan() { 0x7ff8_0000_0000_0000 } else { value.to_bits() };
            (bits ^ (bits >> 32)) as i32
        }
        Const::Bool(value) => if *value { 1231 } else { 1237 },
        Const::Char(value) => i32::from(*value),
        Const::Str(text) => text.encode_utf16().fold(0i32, |hash, unit| hash.wrapping_mul(31).wrapping_add(i32::from(unit))),
    }
}

/// Literal keys are `Literal` records, equal by value; other keys stand for symbols.
fn key<'t>(context: &Context, constants: &Constants<'_, '_, 't>, node: Node<'t>) -> Option<Key> {
    let found = constants.expression(node)?;
    let literal = found.key == "null" || ["S:", "B:", "C:", "I:", "J:", "L:"].iter().any(|kind| found.key.starts_with(kind));
    if !literal {
        return Some(Key { id: found.key, shown: found.shown, hash: None });
    }
    let Some(value) = constant(context, node) else { return Some(Key { id: found.key, shown: found.shown, hash: Some(0) }) };
    let (id, shown) = match &value {
        Const::Int(number) => (format!("I:{number}"), number.to_string()),
        Const::Long(number) => (format!("J:{number}"), number.to_string()),
        Const::Float(number) => (format!("F:{}", java_hash(&value)), float_to_string(*number)),
        Const::Double(number) => (format!("D:{}", number.to_bits()), double_to_string(*number)),
        Const::Bool(flag) => (format!("B:{flag}"), flag.to_string()),
        Const::Char(unit) => (format!("C:{unit}"), String::from_utf16_lossy(&[*unit])),
        Const::Str(text) => (format!("S:{text}"), text.clone()),
    };
    Some(Key { id, shown, hash: Some(java_hash(&value)) })
}

/// The bucket of a hash code in a `HashMap` holding that many entries.
fn bucket(hash: i32, entries: usize) -> usize {
    let mut capacity = 16;
    while entries * 4 > capacity * 3 {
        capacity *= 2;
    }
    let spread = hash ^ ((hash as u32) >> 16) as i32;
    spread as u32 as usize & (capacity - 1)
}

/// Reports repeated keys in the order of Error Prone's `HashMultiset`: by hash bucket, then insertion. Keys that stand
/// for symbols hash by identity, so they come last in insertion order.
fn repeated<'t>(context: &Context, call: Node, keys: &[Node<'t>]) -> bool {
    let constants = Constants::new(context);
    let mut counted: Vec<(Key, usize)> = Vec::new();
    for node in keys {
        let Some(found) = key(context, &constants, *node) else { continue };
        match counted.iter_mut().find(|(seen, _)| seen.id == found.id) {
            Some(entry) => entry.1 += 1,
            None => counted.push((found, 1)),
        }
    }
    let entries = counted.len();
    counted.sort_by_key(|(key, _)| key.hash.map_or(usize::MAX, |hash| bucket(hash, entries)));
    let mut shown: Vec<String> = Vec::new();
    for (key, count) in counted.into_iter().filter(|(_, count)| *count > 1) {
        let entry = format!("{} x {count}", key.shown);
        if !shown.contains(&entry) {
            shown.push(entry);
        }
    }
    if shown.is_empty() {
        return false;
    }
    let message = format!(
        "This ImmutableMap construction will throw (or have known duplicates overwritten) due to duplicates: [{}]",
        shown.join(", ")
    );
    context.report("AlwaysThrows", call, preferred(context, call), &message);
    true
}

/// The keys (or values, at `index` 1) of a chain of `put` calls ending in this one, last call first.
fn builder_entries<'t>(context: &Context, call: Node<'t>, index: usize) -> Vec<Node<'t>> {
    let mut entries = Vec::new();
    let mut receiver = Some(call);
    while let Some(current) = receiver.filter(|current| is_put(context, *current, MAP)) {
        if let Some(entry) = arguments(current).get(index) {
            entries.push(*entry);
        }
        receiver = current.child_by_field_name("object");
    }
    entries
}

/// Whether the call is an ImmutableMap construction that Error Prone looks at no further: an inner `put` of a chain, or
/// one with repeated keys.
fn duplicates(context: &Context, call: Node) -> bool {
    if is_put(context, call, MAP) {
        let outer = parent(call).filter(|outer| outer.child_by_field_name("object") == Some(call));
        if outer.is_some_and(|outer| is_put(context, outer, MAP)) {
            return true;
        }
        return repeated(context, call, &builder_entries(context, call, 0))
            || (is_put(context, call, BI_MAP) && repeated(context, call, &builder_entries(context, call, 1)));
    }
    if is_of(context, call, MAP) {
        let list = arguments(call);
        let at = |index: usize| list.iter().skip(index).step_by(2).copied().collect::<Vec<_>>();
        return repeated(context, call, &at(0)) || (is_of(context, call, BI_MAP) && repeated(context, call, &at(1)));
    }
    false
}

fn constant_text(context: &Context, call: Node) -> Option<String> {
    let list = arguments(call);
    match list.as_slice() {
        [only] => match constant(context, *only)? {
            Const::Str(text) => Some(text),
            _ => None,
        },
        _ => None,
    }
}

/// What the call throws, as `Class: message`.
fn thrown(context: &Context, call: Node) -> Option<String> {
    let parse = matched(context, call, true, &["parse"], |class| PARSED.contains(&class));
    if parse.is_some_and(|method| parameters(&method) == ["java.lang.CharSequence"]) {
        let owner = context.resolver.resolve_call(call)?.declaring;
        let kind = owner.rsplit('.').next().unwrap_or_default().to_string();
        return failure(&kind, &constant_text(context, call)?, jdk_major());
    }
    let hex = matched(context, call, true, &["fromHex"], |class| class == "com.google.protobuf.ByteString");
    if hex.is_some_and(|method| parameters(&method) == ["java.lang.String"]) {
        return failure("ByteString", &constant_text(context, call)?, jdk_major());
    }
    if matched(context, call, true, &["fromString"], |class| class == "java.util.UUID").is_some() {
        return failure("UUID", &constant_text(context, call)?, jdk_major());
    }
    let shifted = matched(context, call, false, &["plus", "minus"], |class| class == "java.time.Instant");
    if shifted.is_some_and(|method| parameters(&method) == ["java.time.temporal.TemporalAmount"]) {
        let list = arguments(call);
        let period = matched(context, *list.first()?, true, &["ofMonths", "ofYears"], |class| class == "java.time.Period");
        if list.len() == 1 && period.is_some() {
            return Some("UnsupportedTemporalTypeException: Instant.plus() and minus() do not support non-days-based Periods.".into());
        }
    }
    None
}

pub fn always_throws(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || duplicates(context, call) {
        return;
    }
    if let Some(thrown) = thrown(context, call) {
        let message = format!("This call will fail at runtime with a {thrown}");
        context.report("AlwaysThrows", call, preferred(context, call), &message);
    }
}

pub fn new_file_system(context: &Context, call: Node) {
    let Some(method) = matched(context, call, true, &["newFileSystem"], |class| class == "java.nio.file.FileSystems") else { return };
    let list = arguments(call);
    if parameters(&method) != ["java.nio.file.Path", "java.lang.ClassLoader"] || list.get(1).is_none_or(|loader| loader.kind() != "null_literal") {
        return;
    }
    let fix = Fix::new().insert(list[1].start_byte(), "(ClassLoader) ");
    let message = "Starting in JDK 13, this call is ambiguous with FileSystem.newFileSystem(Path,Map)";
    context.report_fixed("NewFileSystem", call, preferred(context, call), message, &[fix]);
}
