//! BareDotMetacharacter, CharacterGetNumericValue and GetClassOnEnum: calls recognised by owner, name and arguments.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

const STRING: &str = "java.lang.String";
const PATTERN: &str = "java.util.regex.Pattern";

fn strings(count: usize) -> Vec<Type> {
    vec![Type::class(STRING); count]
}

/// Whether the call is one of `AbstractPatternSyntaxChecker`'s regex-accepting methods, and whether the second argument is the flags.
fn regex_usage(context: &Context, call: Node) -> Option<bool> {
    let name = name_of(context, call);
    let parameters = || context.resolver.resolve_call(call).map(|resolved| resolved.method.parameters);
    if matches!(name, "matches" | "split" | "replaceFirst" | "replaceAll") && instance_on_exact_class(context, call, STRING, &[name]) {
        let wanted: Vec<Vec<Type>> = match name {
            "matches" => vec![strings(1)],
            "split" => vec![strings(1), vec![Type::class(STRING), Type::Primitive("int")]],
            _ => vec![strings(2)],
        };
        return parameters().is_some_and(|found| wanted.contains(&found)).then_some(false);
    }
    if name == "matches" && static_on_class(context, call, PATTERN, &[name]) {
        return Some(false);
    }
    if name == "compile" && static_on_class(context, call, PATTERN, &[name]) {
        let found = parameters()?;
        if found == strings(1) {
            return Some(false);
        }
        return (found == [Type::class(STRING), Type::Primitive("int")]).then_some(true);
    }
    if name == "onPattern" && static_on_class(context, call, "com.google.common.base.Splitter", &[name]) {
        return Some(false);
    }
    if matches!(name, "matches" | "doesNotMatch" | "containsMatch" | "doesNotContainMatch") {
        let receiver = receiver_class(context, call)?;
        let found = parameters()?;
        let instance = context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static);
        if instance && found == strings(1) && context.resolver.index.is_subtype(&receiver, "com.google.common.truth.StringSubject") {
            return Some(false);
        }
    }
    None
}

pub fn bare_dot_metacharacter(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(flags) = regex_usage(context, call) else { return };
    let list = arguments(call);
    let Some(first) = list.first().copied() else { return };
    let Some(Const::Str(pattern)) = constant(context, first) else { return };
    if flags && !matches!(list.get(1).and_then(|second| constant(context, *second)), Some(Const::Int(_))) {
        return;
    }
    if pattern == "." {
        let fix = Fix::replace(first.start_byte(), first.end_byte(), "\"\\\\.\"");
        let message = "\".\" is rarely useful as a regex, as it matches any character. To match a literal '.' character, instead write \"\\\\.\".";
        context.report_fixed("BareDotMetacharacter", call, preferred(context, call), message, &[fix]);
    }
}

pub fn character_get_numeric_value(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || name_of(context, call) != "getNumericValue" {
        return;
    }
    if static_on_class(context, call, "com.ibm.icu.lang.UCharacter", &["getNumericValue"]) || static_on_class(context, call, "java.lang.Character", &["getNumericValue"]) {
        let message = "getNumericValue has unexpected behaviour: it interprets A-Z as base-36 digits with values 10-35, but also supports non-arabic numerals and miscellaneous numeric unicode characters like \u{32b7}; consider using Character.digit or UCharacter.getUnicodeNumericValue instead";
        context.report_fixed("CharacterGetNumericValue", call, preferred(context, call), message, &[]);
    }
}

pub fn get_class_on_enum(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || name_of(context, call) != "getClass" || !arguments(call).is_empty() {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || !resolved.method.parameters.is_empty() {
        return;
    }
    let Some(object) = call.child_by_field_name("object") else { return };
    let receiver = if object.kind() == "super" {
        enclosing_type(context.file, context.resolver.scope, call).and_then(|class| context.resolver.index.get(&class).and_then(|info| info.superclass.clone()))
    } else {
        receiver_class(context, call)
    };
    if !receiver.is_some_and(|class| context.resolver.index.is_subtype(&class, "java.lang.Enum")) {
        return;
    }
    let fix = Fix::replace(object.end_byte(), call.end_byte(), ".getDeclaringClass()");
    context.report_fixed("GetClassOnEnum", call, preferred(context, call), "Calling getClass() on an enum may return a subclass of the enum type", &[fix]);
}

const BIG_DECIMAL: &str = "java.math.BigDecimal";

fn is_big_decimal(context: &Context, node: Option<Node>) -> bool {
    node.and_then(|part| context.resolver.type_of(part)).is_some_and(|kind| kind.erased() == Type::class(BIG_DECIMAL))
}

pub fn big_decimal_equals(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !matches!(name_of(context, call), "equals" | "equal") {
        return;
    }
    let list = arguments(call);
    let (receiver, argument) = if list.len() == 2 && super::array_calls::static_equals(context, call) {
        (Some(list[0]), list[1])
    } else if list.len() == 1 && name_of(context, call) == "equals" && super::equals_methods::instance_equals_call(context, call) {
        (call.child_by_field_name("object"), list[0])
    } else {
        return;
    };
    let mut enclosing = crate::engine::source::parent(call);
    while let Some(at) = enclosing {
        if matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
            if super::equals_methods::equals_declaration(context, at) {
                return;
            }
            break;
        }
        enclosing = crate::engine::source::parent(at);
    }
    if is_big_decimal(context, receiver) || is_big_decimal(context, Some(argument)) {
        context.report_fixed("BigDecimalEquals", call, preferred(context, call), "BigDecimal#equals has surprising behavior: it also compares scale.", &[]);
    }
}

pub fn collector_should_not_use_state(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.util.stream.Collector", &["of"]) {
        return;
    }
    let mut stateful = false;
    for part in crate::engine::source::children(call) {
        crate::engine::source::walk(part, |inner| {
            if inner.kind() == "object_creation_expression" {
                if let Some(body) = crate::engine::source::children(inner).into_iter().find(|part| part.kind() == "class_body") {
                    stateful |= super::members::members(body).into_iter().any(|member| member.kind() == "field_declaration" && !crate::java::helpers::has_modifier(member, "final"));
                }
            }
        });
    }
    if stateful {
        context.report_fixed("CollectorShouldNotUseState", call, preferred(context, call), "Collector.of() should not use state", &[]);
    }
}

const SIMPLE_TYPES: [&str; 16] = [
    "java.time.DayOfWeek", "java.time.Duration", "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime",
    "java.time.Month", "java.time.MonthDay", "java.time.OffsetDateTime", "java.time.OffsetTime", "java.time.Period", "java.time.Year",
    "java.time.YearMonth", "java.time.ZonedDateTime", "java.lang.String", "java.math.BigDecimal",
];

fn simple_type(kind: &Type) -> bool {
    match kind {
        Type::Primitive(name) => *name != "void",
        Type::Class(name, _) => {
            let boxed = Type::class(name).unboxed_or_same();
            matches!(boxed, Type::Primitive(_)) || SIMPLE_TYPES.contains(&name.as_str())
        }
        _ => false,
    }
}

pub fn binding_to_unqualified_common_type(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" => {
            let annotations = super::inject_checks::annotations_of(node);
            if !annotations.iter().any(|annotation| super::inject_checks::is_one_of(context, *annotation, &["com.google.inject.Provides"]))
                || annotations.iter().any(|annotation| super::inject_checks::is_qualifier(context, *annotation))
            {
                return;
            }
            let Some(returned) = node.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)) else { return };
            if node.child_by_field_name("dimensions").is_none() && simple_type(&returned.erased()) && !super::testcode::is_junit_test_code(context, node) {
                context.report_fixed("BindingToUnqualifiedCommonType", node, super::nodes::name_position(node), BINDING_MESSAGE, &[]);
            }
        }
        "method_invocation" => {
            if !matches!(name_of(context, node), "to" | "toInstance" | "toProvider" | "toConstructor") {
                return;
            }
            let Some(bind) = node.child_by_field_name("object").filter(|part| part.kind() == "method_invocation" && name_of(context, *part) == "bind") else { return };
            let Some(resolved) = context.resolver.resolve_call(node) else { return };
            if resolved.method.is_static || !receiver_class(context, node).is_some_and(|class| context.resolver.index.is_subtype(&class, "com.google.inject.binder.LinkedBindingBuilder")) {
                return;
            }
            let Some(bound) = context.resolver.resolve_call(bind) else { return };
            let listed = receiver_class(context, bind).is_some_and(|class| ["com.google.inject.AbstractModule", "com.google.inject.Binder"].iter().any(|owner| context.resolver.index.is_subtype(&class, owner)));
            if bound.method.is_static || !listed || bound.method.parameters.len() != 1 || bound.method.parameters[0].erased() != Type::class("java.lang.Class") {
                return;
            }
            let list = arguments(bind);
            let literal = list.iter().all(|argument| {
                argument.kind() == "class_literal"
                    && crate::engine::source::children(*argument).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment")).and_then(|kind| context.resolver.written(kind, false)).is_some_and(|kind| simple_type(&kind.erased()))
            });
            if literal && !list.is_empty() && !super::testcode::is_junit_test_code(context, node) {
                context.report_fixed("BindingToUnqualifiedCommonType", node, preferred(context, node), BINDING_MESSAGE, &[]);
            }
        }
        _ => {}
    }
}

const BINDING_MESSAGE: &str = "This code declares a binding for a common value type without a Qualifier annotation.";
