//! `FormatStringValidation`: formats each constant format string with a sample instance of each argument's type and
//! reports what `java.util.Formatter` throws, answered by the engine's model of the formatter.
use super::Context;
use super::consts::{Const, constant};
use super::formatter::{Arg, validate as formatted};
use crate::java::types::model::{Method, Type};
use crate::java::types::project::jdk_major;
use tree_sitter::Node;

const OBJECT: &str = "java.lang.Object";
const LAZY_ARG: &str = "com.google.common.flogger.LazyArg";

/// The string constants of a format argument, both branches of a conditional taken apart.
pub fn constant_strings(context: &Context, node: Node) -> Vec<String> {
    if node.kind() == "ternary_expression" {
        let branch = |field| node.child_by_field_name(field).map(|part| constant_strings(context, part)).unwrap_or_default();
        return branch("consequence").into_iter().chain(branch("alternative")).collect();
    }
    match constant(context, node) {
        Some(Const::Str(text)) => vec![text],
        _ => Vec::new(),
    }
}

fn of_primitive(name: &str) -> Option<Arg> {
    Some(match name {
        "boolean" => Arg::Bool,
        "byte" => Arg::Byte,
        "short" => Arg::Short,
        "int" => Arg::Int(3),
        "long" => Arg::Long,
        "char" => Arg::Char,
        "float" => Arg::Float,
        "double" => Arg::Double,
        _ => Arg::Null,
    })
}

const CLASSES: [(&str, Arg); 7] = [
    ("java.lang.String", Arg::Str),
    ("java.math.BigDecimal", Arg::BigDecimal),
    ("java.math.BigInteger", Arg::BigInteger),
    ("java.util.Date", Arg::Date),
    ("java.util.Calendar", Arg::Calendar),
    ("java.time.Instant", Arg::Instant),
    ("java.time.temporal.TemporalAccessor", Arg::Zoned),
];

/// The sample instance `FormatStringValidation.getInstance` picks for a type; `None` when the engine cannot tell.
fn of_type(context: &Context, usage: Node, written: &Type) -> Option<Arg> {
    let bound = match written {
        Type::Variable(name) => super::array_calls::variable_bound(context, usage, name),
        _ => None,
    };
    let written = bound.as_ref().unwrap_or(written);
    let erased = match written {
        Type::Null => return Some(Arg::Null),
        Type::Variable(_) => Type::class(OBJECT),
        Type::Wildcard | Type::Bounded(true, _) => Type::class(OBJECT),
        Type::Bounded(false, bound) => return of_type(context, usage, bound),
        other => other.erased(),
    };
    let index = &context.resolver.index;
    match erased.clone().unboxed_or_same() {
        Type::Primitive(name) => return of_primitive(name),
        Type::Class(name, _) => {
            if name == "java.lang.Number" {
                return Some(Arg::Int(0));
            }
            for (class, arg) in CLASSES {
                if name == class || index.is_subtype(&name, class) {
                    return Some(arg);
                }
            }
            if name == LAZY_ARG || index.is_subtype(&name, LAZY_ARG) {
                return match lazy_argument(context, written, 0)? {
                    Some(argument) => of_type(context, usage, &argument),
                    None => Some(Arg::Formattable),
                };
            }
            if name != OBJECT && index.get(&name).is_none() {
                return None;
            }
        }
        _ => {}
    }
    Some(Arg::Formattable)
}

/// `types.asSuper(type, LazyArg)`: its type argument, `Some(None)` for a raw `LazyArg`, `None` when unknown.
fn lazy_argument(context: &Context, written: &Type, depth: usize) -> Option<Option<Type>> {
    let Type::Class(name, arguments) = written else { return None };
    if name == LAZY_ARG {
        return Some(arguments.first().cloned());
    }
    let info = context.resolver.index.get(name)?;
    if depth > 20 {
        return None;
    }
    let raw = arguments.is_empty() && !info.type_parameters.is_empty();
    let map: std::collections::HashMap<String, Type> =
        info.type_parameters.iter().map(|(variable, _)| variable.clone()).zip(arguments.iter().cloned()).collect();
    for parent in &info.generic_supers {
        if parent.erased().name() == LAZY_ARG || context.resolver.index.is_subtype(&parent.erased().name(), LAZY_ARG) {
            let parent = if raw { parent.erased() } else { parent.substitute(&map) };
            return lazy_argument(context, &parent, depth + 1);
        }
    }
    None
}

fn of_constant(value: Const) -> Arg {
    match value {
        Const::Int(value) => Arg::Int(value),
        Const::Long(_) => Arg::Long,
        Const::Float(_) => Arg::Float,
        Const::Double(_) => Arg::Double,
        Const::Bool(_) => Arg::Bool,
        Const::Char(_) => Arg::Char,
        Const::Str(_) => Arg::Str,
    }
}

/// The sample instance for an argument expression: its constant value, else one for its type.
pub fn instance(context: &Context, node: Node) -> Option<Arg> {
    if let Some(value) = constant(context, node) {
        return Some(of_constant(value));
    }
    of_type(context, node, &context.resolver.type_of(node)?)
}

fn jdk() -> u32 {
    match jdk_major() {
        0 => 21,
        major => major,
    }
}

/// `FormatStringValidation.validate`: the message for the first constant format string that fails.
pub fn validate(context: &Context, method: Option<&Method>, arguments: &[Node]) -> Option<String> {
    let (format, rest) = arguments.split_first()?;
    let strings = constant_strings(context, *format);
    if strings.is_empty() {
        return None;
    }
    if rest.len() == 1 && method.is_none_or(|method| method.varargs) {
        if context.resolver.type_of(rest[0]) == Some(Type::Array(Box::new(Type::class(OBJECT)))) {
            return None;
        }
    }
    let instances: Vec<Arg> = rest.iter().map(|node| instance(context, *node)).collect::<Option<_>>()?;
    strings.iter().find_map(|text| formatted(text, &instances, jdk()))
}

/// Whether `String.format(text)` throws MissingFormatArgumentException on the run's JDK.
pub fn misses_arguments(text: &str) -> bool {
    super::formatter::misses_arguments(text, jdk())
}
