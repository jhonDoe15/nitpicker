//! FloggerArgumentToString: arguments converted to strings before they reach a formatting method.
use super::Context;
use super::call_consts::lenient_position;
use super::call_match::static_on_class;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::java_text::escape_java_chars;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

const LOGGING_API: &str = "com.google.common.flogger.LoggingApi";

static VALID_TERM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^(?:[cCbBn]|#?(?:[1-9][0-9]*)?[sS]|,?(?:[1-9][0-9]*)?d|0[1-9][0-9]*d|#?(?:0[1-9][0-9]*)?[xX]|,?(?:[1-9][0-9]*)?(?:\.[0-9]+)?[feEgG])\z",
    )
    .unwrap()
});

#[derive(Clone, Copy, PartialEq)]
enum Unwrapper {
    ToString,
    StringValueOf,
    StaticToString,
    StaticValueOf,
    StringToUpperCase,
    AsciiToUpperCase,
    StaticToHexString,
    ArraysAsListOrToString,
}

const ALL: [Unwrapper; 8] = [
    Unwrapper::ToString,
    Unwrapper::StringValueOf,
    Unwrapper::StaticToString,
    Unwrapper::StaticValueOf,
    Unwrapper::StringToUpperCase,
    Unwrapper::AsciiToUpperCase,
    Unwrapper::StaticToHexString,
    Unwrapper::ArraysAsListOrToString,
];

const LENIENT: [Unwrapper; 3] = [Unwrapper::ToString, Unwrapper::StringValueOf, Unwrapper::StaticToString];

const WRAPPERS: [(&str, &str); 8] = [
    ("java.lang.Boolean", "boolean"),
    ("java.lang.Character", "char"),
    ("java.lang.Byte", "byte"),
    ("java.lang.Short", "short"),
    ("java.lang.Integer", "int"),
    ("java.lang.Long", "long"),
    ("java.lang.Float", "float"),
    ("java.lang.Double", "double"),
];

struct Parameter {
    source: String,
    kind: Option<Type>,
    placeholder: char,
}

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn only_parameter(context: &Context, call: Node) -> Option<Type> {
    let resolved = context.resolver.resolve_call(call)?;
    match resolved.method.parameters.as_slice() {
        [only] => Some(only.clone()),
        _ => None,
    }
}

fn static_wrapper(context: &Context, call: Node, name: &str, only: &[&str]) -> bool {
    WRAPPERS.iter().filter(|(class, _)| only.is_empty() || only.contains(class)).any(|(class, primitive)| {
        static_on_class(context, call, class, &[name]) && only_parameter(context, call) == Some(Type::Primitive(primitive))
    })
}

fn object_array(context: &Context, argument: Node) -> bool {
    matches!(context.resolver.type_of(argument), Some(Type::Array(element)) if *element == Type::class("java.lang.Object"))
}

fn matches_unwrapper(context: &Context, call: Node, unwrapper: Unwrapper) -> bool {
    if call.kind() != "method_invocation" {
        return false;
    }
    let name = name_of(context, call);
    match unwrapper {
        Unwrapper::ToString => {
            name == "toString" && arguments(call).is_empty() && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && resolved.method.parameters.is_empty())
        }
        Unwrapper::StringValueOf => false,
        Unwrapper::StaticToString => name == "toString" && static_wrapper(context, call, "toString", &[]),
        Unwrapper::StaticValueOf => name == "valueOf" && static_wrapper(context, call, "valueOf", &[]),
        Unwrapper::StringToUpperCase => {
            name == "toUpperCase"
                && arguments(call).is_empty()
                && super::call_match::instance_on_exact_class(context, call, "java.lang.String", &["toUpperCase"])
                && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.is_empty())
        }
        Unwrapper::AsciiToUpperCase => {
            name == "toUpperCase"
                && static_on_class(context, call, "com.google.common.base.Ascii", &["toUpperCase"])
                && matches!(only_parameter(context, call), Some(Type::Class(class, _)) if class == "java.lang.String" || class == "java.lang.CharSequence")
        }
        Unwrapper::StaticToHexString => {
            name == "toHexString" && static_wrapper(context, call, "toHexString", &["java.lang.Integer", "java.lang.Long"])
        }
        Unwrapper::ArraysAsListOrToString => {
            matches!(name, "asList" | "toString") && static_on_class(context, call, "java.util.Arrays", &[name]) && matches!(arguments(call).as_slice(), [only] if object_array(context, *only))
        }
    }
}

fn unwrap(context: &Context, call: Node, unwrapper: Unwrapper, placeholder: char) -> Parameter {
    let only = || arguments(call).first().copied().unwrap_or(call);
    let of = |node: Node, placeholder: char| Parameter { source: context.text(node).to_string(), kind: context.resolver.type_of(node), placeholder };
    match unwrapper {
        Unwrapper::ToString | Unwrapper::StringValueOf => match call.child_by_field_name("object") {
            Some(receiver) => of(receiver, placeholder),
            None => Parameter { source: "this".to_string(), kind: None, placeholder },
        },
        Unwrapper::StaticToString | Unwrapper::StaticValueOf | Unwrapper::ArraysAsListOrToString => of(only(), placeholder),
        Unwrapper::StringToUpperCase => match call.child_by_field_name("object") {
            Some(receiver) => of(receiver, 'S'),
            None => Parameter { source: "this".to_string(), kind: None, placeholder: 'S' },
        },
        Unwrapper::AsciiToUpperCase => of(only(), 'S'),
        Unwrapper::StaticToHexString => of(only(), if placeholder.is_ascii_uppercase() { 'X' } else { 'x' }),
    }
}

/// `FloggerHelpers.inferFormatSpecifier`.
fn infer_format_specifier(kind: Option<&Type>) -> char {
    let Some(kind) = kind else { return 's' };
    let primitive = match kind {
        Type::Primitive(name) => *name,
        Type::Class(name, _) => WRAPPERS.iter().find(|(class, _)| class == name).map_or("", |(_, primitive)| primitive),
        _ => "",
    };
    match primitive {
        "int" | "long" => 'd',
        "float" | "double" => 'g',
        _ => 's',
    }
}

/// `VisitorState.getConstantExpression` of a string: quoted, `'` left unescaped.
fn constant_expression(text: &str) -> String {
    let escaped: Vec<char> = format!("\"{}\"", escape_java_chars(text)).chars().collect();
    let mut out = String::new();
    let mut at = 0;
    while at < escaped.len() {
        let c = escaped[at];
        if c == '\\' && at + 1 < escaped.len() {
            at += 1;
            if escaped[at] != '\'' {
                out.push(c);
            }
            out.push(escaped[at]);
        } else {
            out.push(c);
        }
        at += 1;
    }
    out
}

/// The next printf term that starts exactly at `from`: where it starts and ends, `%` included.
fn term_at(format: &[char], from: usize) -> Option<(usize, usize)> {
    let mut at = from;
    while at < format.len() && format[at] != '%' {
        at += 1;
    }
    while format.get(at) == Some(&'%') && format.get(at + 1) == Some(&'%') {
        at += 2;
        while at < format.len() && format[at] != '%' {
            at += 1;
        }
    }
    if format.get(at) != Some(&'%') {
        return None;
    }
    let mut end = at + 1;
    while end < format.len() && format[end] != '%' && !format[end].is_ascii_alphabetic() {
        end += 1;
    }
    format.get(end).is_some_and(|letter| letter.is_ascii_alphabetic()).then_some((at, end + 1))
}

fn unwrap_arguments(context: &Context, call: Node, format: &str, args: &[Node]) {
    if !args.iter().any(|arg| ALL.iter().any(|unwrapper| matches_unwrapper(context, *arg, *unwrapper))) {
        return;
    }
    let text: Vec<char> = format.chars().collect();
    let mut fix = Fix::new();
    let mut out = String::new();
    let mut start = 0;
    let mut index = 0;
    let mut fixed = false;
    while let Some((begin, end)) = term_at(&text, start) {
        let mut term: String = text[begin..end].iter().collect();
        if !VALID_TERM.is_match(&term[1..]) {
            return;
        }
        if term == "%n" {
            term = "\\n".to_string();
        } else {
            if term.len() == 2 {
                let Some(argument) = args.get(index).copied() else { return };
                let placeholder = text[begin + 1];
                if let Some(unwrapper) = ALL.iter().find(|unwrapper| matches_unwrapper(context, argument, **unwrapper)) {
                    let parameter = unwrap(context, argument, *unwrapper, placeholder);
                    fix = fix.and(argument.start_byte(), argument.end_byte(), parameter.source.clone());
                    let letter = if parameter.placeholder == 's' { infer_format_specifier(parameter.kind.as_ref()) } else { parameter.placeholder };
                    term = format!("%{letter}");
                    fixed = true;
                }
            }
            index += 1;
        }
        out.extend(&text[start..begin]);
        out.push_str(&term);
        start = end;
    }
    out.extend(&text[start..]);
    let Some(first) = arguments(call).first().copied() else { return };
    if !fixed {
        return;
    }
    let fix = fix.and(first.start_byte(), first.end_byte(), constant_expression(&out));
    let message = "Use Flogger's printf-style formatting instead of explicitly converting arguments to strings. Note that Flogger does more than just call toString; for instance, it formats arrays sensibly.";
    context.report_fixed("FloggerArgumentToString", call, preferred(context, call), message, &[fix]);
}

pub fn flogger_argument_to_string(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    let logging = name_of(context, call) == "log"
        && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static)
        && receiver_class(context, call).is_some_and(|class| class == LOGGING_API || context.resolver.index.is_subtype(&class, LOGGING_API));
    if logging {
        let Some(first) = list.first() else { return };
        let Some(Const::Str(format)) = constant(context, *first) else { return };
        return unwrap_arguments(context, call, &format, &list[1..]);
    }
    let Some(position) = lenient_position(context, call, list.len()) else { return };
    for argument in list.iter().skip(position + 1) {
        let Some(unwrapper) = LENIENT.iter().find(|unwrapper| matches_unwrapper(context, *argument, **unwrapper)) else { continue };
        let parameter = unwrap(context, *argument, *unwrapper, 's');
        let fix = Fix::replace(argument.start_byte(), argument.end_byte(), parameter.source);
        let message = "Avoid eagerly stringifying arguments to lenient format methods. The method will stringify if needed, and the evaluation may be lazy.";
        context.report_fixed("FloggerArgumentToString", *argument, preferred(context, *argument), message, &[fix]);
    }
}
