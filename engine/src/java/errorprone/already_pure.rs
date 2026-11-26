//! Error Prone's `ConstantExpressions`: the expressions that stand for the same value each time they are read.
use super::Context;
use super::immutable_known::IMMUTABLE;
use super::vars::{Named, named};
use crate::engine::source::{named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{Method, Type, flag};
use crate::java::types::scope::enclosing_type;
use std::cell::RefCell;
use std::collections::HashMap;
use tree_sitter::Node;

/// A constant expression: `key` tells two of them apart, `shown` is how Error Prone prints it.
#[derive(Clone, Debug)]
pub struct Ce {
    pub key: String,
    pub shown: String,
}

const STATIC_CLASSES: [&str; 29] = [
    "com.google.common.base.Optional", "com.google.common.base.Pair", "com.google.common.base.Splitter", "com.google.common.collect.ImmutableBiMap",
    "com.google.common.collect.ImmutableCollection", "com.google.common.collect.ImmutableList", "com.google.common.collect.ImmutableListMultimap",
    "com.google.common.collect.ImmutableMap", "com.google.common.collect.ImmutableMultimap", "com.google.common.collect.ImmutableMultiset",
    "com.google.common.collect.ImmutableRangeMap", "com.google.common.collect.ImmutableRangeSet", "com.google.common.collect.ImmutableSet",
    "com.google.common.collect.ImmutableSetMultimap", "com.google.common.collect.ImmutableSortedMap", "com.google.common.collect.ImmutableSortedMultiset",
    "com.google.common.collect.ImmutableSortedSet", "com.google.common.collect.ImmutableTable", "com.google.common.collect.Range",
    "com.google.protobuf.GeneratedMessage", "java.time.MonthDay", "java.time.Period", "java.time.Year", "java.time.YearMonth", "java.time.ZoneId",
    "java.time.ZoneOffset", "java.util.regex.Pattern", "java.util.Optional", "java.util.OptionalDouble",
];
const MORE_STATIC: [&str; 14] = [
    "java.util.OptionalInt", "java.util.OptionalLong", "org.joda.time.DateTime", "org.joda.time.DateTimeZone", "org.joda.time.Days", "org.joda.time.Duration",
    "org.joda.time.Instant", "org.joda.time.Interval", "org.joda.time.LocalDate", "org.joda.time.LocalDateTime", "org.joda.time.Period",
    "org.joda.time.format.DateTimeFormatter", "java.lang.String", "java.time.Duration",
];
const DURATIONS: [&str; 6] = ["ofNanos", "ofMillis", "ofSeconds", "ofMinutes", "ofHours", "ofDays"];
const PROTO_TIMES: [&str; 4] = ["fromNanos", "fromMicros", "fromMillis", "fromSeconds"];
const PROTO_DURATIONS: [&str; 7] = ["fromNanos", "fromMicros", "fromMillis", "fromSeconds", "fromMinutes", "fromHours", "fromDays"];
const JODA_DURATIONS: [&str; 5] = ["millis", "standardSeconds", "standardMinutes", "standardHours", "standardDays"];

pub struct Constants<'c, 'a, 't> {
    context: &'c Context<'a>,
    assigned: RefCell<HashMap<usize, Vec<Node<'t>>>>,
}

fn is_long(method: &Method) -> bool {
    method.parameters == [Type::Primitive("long")]
}

fn is_object_pair(method: &Method, count: usize) -> bool {
    method.parameters.len() == count && method.parameters.iter().all(|kind| matches!(kind, Type::Class(name, _) if name == "java.lang.Object"))
}

impl<'c, 'a, 't> Constants<'c, 'a, 't> {
    pub fn new(context: &'c Context<'a>) -> Constants<'c, 'a, 't> {
        Constants { context, assigned: RefCell::new(HashMap::new()) }
    }

    pub fn expression(&self, node: Node<'t>) -> Option<Ce> {
        let context = self.context;
        match node.kind() {
            "binary_expression" if super::shape::folded_strings(node) => {
                let value = context.resolver.constant_string(node)?;
                Some(Ce { key: format!("S:{value}"), shown: value })
            }
            "binary_expression" => {
                let operator = node.child_by_field_name("operator").map(|operator| context.text(operator))?;
                if !matches!(operator, "==" | "!=") {
                    return None;
                }
                let left = self.expression(node.child_by_field_name("left")?)?;
                let right = self.expression(node.child_by_field_name("right")?)?;
                let (first, second) = if left.key <= right.key { (&left, &right) } else { (&right, &left) };
                Some(Ce { key: format!("E({},{})", first.key, second.key), shown: format!("{} equals {}", left.shown, right.shown) })
            }
            "this" => Some(Ce { key: "this".to_string(), shown: "this".to_string() }),
            "identifier" => self.identifier(node),
            "field_access" => self.field(node),
            "method_invocation" => self.invocation(node),
            "unary_expression" => negative_literal(self.context, node),
            _ => literal(self.context, node),
        }
    }

    fn identifier(&self, node: Node<'t>) -> Option<Ce> {
        let context = self.context;
        let name = context.text(node).to_string();
        match named(context, node) {
            Some(Named::Variable(declarator)) => {
                let holder = parent(declarator)?;
                if matches!(holder.kind(), "field_declaration" | "constant_declaration") {
                    let class = enclosing_type(context.file, context.resolver.scope, declarator)?;
                    let fixed = holder.kind() == "constant_declaration" || has_modifier(holder, "final");
                    return fixed.then(|| Ce { key: format!("f:{class}.{name}"), shown: name });
                }
                let final_local = has_modifier(holder, "final") || self.effectively_final(declarator, node, holder.kind() == "local_variable_declaration" && declarator.child_by_field_name("value").is_none());
                final_local.then(|| Ce { key: format!("v{}", declarator.start_byte()), shown: name })
            }
            Some(Named::Other(declaration)) => {
                if declaration.kind() == "enum_constant" {
                    let class = enclosing_type(context.file, context.resolver.scope, declaration)?;
                    return Some(Ce { key: format!("f:{class}.{name}"), shown: name });
                }
                let final_one = has_modifier(declaration, "final") || self.effectively_final(declaration, node, false);
                final_one.then(|| Ce { key: format!("v{}", declaration.start_byte()), shown: name })
            }
            None => match context.resolver.binding(node, &name)? {
                Binding::Field(_, info, field) => (field.flags & flag::FINAL != 0).then(|| Ce { key: format!("f:{}.{name}", info.name), shown: name }),
                Binding::Local(_) => None,
            },
        }
    }

    /// Never assigned after its declaration. A variable declared without a value may be assigned once.
    fn effectively_final(&self, declaration: Node<'t>, usage: Node<'t>, unvalued: bool) -> bool {
        let context = self.context;
        let mut member = usage;
        while let Some(holder) = parent(member) {
            if matches!(holder.kind(), "class_body" | "enum_body_declarations" | "interface_body" | "enum_body" | "program") {
                break;
            }
            member = holder;
        }
        let mut cache = self.assigned.borrow_mut();
        let sites = cache.entry(member.id()).or_insert_with(|| {
            let mut found = Vec::new();
            walk(member, |node| {
                let target = match node.kind() {
                    "assignment_expression" => node.child_by_field_name("left"),
                    "update_expression" => named_children(node).into_iter().next(),
                    _ => None,
                };
                if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                    found.push(target);
                }
            });
            found
        });
        let name = context.text(declaration.child_by_field_name("name").unwrap_or(declaration));
        let writes = sites
            .iter()
            .filter(|site| context.text(**site) == name && matches!(named(context, **site), Some(Named::Variable(found) | Named::Other(found)) if found.id() == declaration.id()))
            .count();
        writes == 0 || (unvalued && writes == 1)
    }

    fn field(&self, node: Node<'t>) -> Option<Ce> {
        let context = self.context;
        let object = node.child_by_field_name("object")?;
        let field = context.text(node.child_by_field_name("field")?).to_string();
        match context.resolver.receiver(object)? {
            Receiver::Static(owner) => {
                let (info, found) = context.resolver.index.field(&owner, &field)?;
                (found.flags & flag::FINAL != 0).then(|| Ce { key: format!("f:{}.{field}", info.name), shown: field })
            }
            Receiver::Value(kind) => {
                let receiver = self.expression(object)?;
                let key = match &kind {
                    Type::Array(_) if field == "length" => "length".to_string(),
                    Type::Class(owner, _) => {
                        let (info, found) = context.resolver.index.field(owner, &field)?;
                        if found.flags & flag::FINAL == 0 {
                            return None;
                        }
                        format!("f:{}.{field}", info.name)
                    }
                    _ => return None,
                };
                Some(Ce { key: format!("{key}@{}", receiver.key), shown: format!("{}.{field}", receiver.shown) })
            }
        }
    }

    fn invocation(&self, node: Node<'t>) -> Option<Ce> {
        let context = self.context;
        let resolved = context.resolver.resolve_call(node)?;
        let object = node.child_by_field_name("object");
        let method = &resolved.method;
        let receiver = match object {
            Some(object) if !method.is_static => Some(self.expression(object)?),
            _ => None,
        };
        if !self.pure(node, &resolved) {
            return None;
        }
        let mut arguments = Vec::new();
        for argument in node.child_by_field_name("arguments").map(named_children).unwrap_or_default() {
            if !argument.kind().ends_with("comment") {
                arguments.push(self.expression(argument)?);
            }
        }
        let parameters: Vec<String> = method.parameters.iter().map(|kind| kind.name()).collect();
        let keys: Vec<&str> = arguments.iter().map(|argument| argument.key.as_str()).collect();
        let key = format!("m:{}.{}({})@{}[{}]", resolved.declaring, method.name, parameters.join(","), receiver.as_ref().map_or("", |receiver| receiver.key.as_str()), keys.join(";"));
        let owner = if method.is_static { format!("{}.", resolved.declaring.rsplit('.').next().unwrap_or_default()) } else { String::new() };
        let shown_arguments: Vec<&str> = arguments.iter().map(|argument| argument.shown.as_str()).collect();
        let shown = format!("{}{owner}{}({})", receiver.as_ref().map_or(String::new(), |receiver| format!("{}.", receiver.shown)), method.name, shown_arguments.join(", "));
        Some(Ce { key, shown })
    }

    fn immutable_type(&self, kind: Option<Type>) -> bool {
        let index = self.context.resolver.index;
        match kind {
            Some(Type::Primitive(_)) => true,
            Some(Type::Class(name, _)) => {
                IMMUTABLE.iter().any(|(known, _)| index.is_subtype(&name, known)) || index.get(&name).is_some_and(|info| info.flags & (flag::IMMUTABLE | flag::ENUM) != 0)
            }
            _ => false,
        }
    }

    /// The method call is known to give the same value each time.
    fn pure(&self, node: Node<'t>, resolved: &crate::java::types::expr::Call) -> bool {
        let context = self.context;
        let index = context.resolver.index;
        let method = &resolved.method;
        let name = method.name.as_str();
        let declaring = resolved.declaring.as_str();
        let receiver = resolved.receiver.name();
        if method.is_static {
            let listed = STATIC_CLASSES.contains(&declaring) || MORE_STATIC.contains(&declaring) && declaring != "java.time.Duration";
            let timed = match declaring {
                "java.time.Duration" => DURATIONS.contains(&name) && is_long(method),
                "java.time.Instant" => matches!(name, "ofEpochMilli" | "ofEpochSecond") && is_long(method),
                "com.google.protobuf.util.Timestamps" => PROTO_TIMES.contains(&name),
                "com.google.protobuf.util.Durations" => PROTO_DURATIONS.contains(&name),
                "org.joda.time.Duration" => JODA_DURATIONS.contains(&name) && is_long(method),
                _ => false,
            };
            let default_instance = name == "getDefaultInstance" && index.is_subtype(&receiver, "com.google.protobuf.MessageLite");
            let equality = is_object_pair(method, 2)
                && matches!((declaring, name), ("java.util.Objects", "equals") | ("com.google.common.base.Objects", "equal") | ("androidx.v4.util.ObjectsCompat", "equals") | ("android.support.v4.util.ObjectsCompat", "equals"))
                && method.returns == Type::Primitive("boolean")
                && node.child_by_field_name("arguments").map(named_children).is_some_and(|arguments| {
                    let typed: Vec<Node> = arguments.into_iter().filter(|argument| !argument.kind().ends_with("comment")).collect();
                    typed.len() == 2 && typed.iter().all(|argument| self.immutable_type(context.resolver.type_of(*argument)))
                });
            if listed || timed || default_instance || equality || self.annotated(method, declaring) {
                return true;
            }
            return false;
        }
        if IMMUTABLE.iter().any(|(known, _)| index.is_subtype(&receiver, known)) || declaring == "java.lang.String" || self.annotated(method, declaring) {
            return true;
        }
        if name == "equals" && is_object_pair(method, 1) && method.returns == Type::Primitive("boolean") {
            let Some(object) = node.child_by_field_name("object") else { return false };
            let argument = node.child_by_field_name("arguments").and_then(|arguments| named_children(arguments).into_iter().find(|part| !part.kind().ends_with("comment")));
            return self.immutable_type(context.resolver.type_of(object)) && argument.is_some_and(|argument| self.immutable_type(context.resolver.type_of(argument)));
        }
        false
    }

    fn annotated(&self, method: &Method, declaring: &str) -> bool {
        let index = self.context.resolver.index;
        method.detail.annotations.iter().any(|annotation| annotation == "org.checkerframework.dataflow.qual.Pure")
            || (method.is_abstract && index.get(declaring).is_some_and(|info| info.flags & flag::AUTO_VALUE != 0))
    }
}

/// javac's parser reads `-` before a nonzero decimal integer literal as one literal.
fn negative_literal(context: &Context, node: Node) -> Option<Ce> {
    let operand = node.child_by_field_name("operand").filter(|operand| operand.kind() == "decimal_integer_literal")?;
    if node.child_by_field_name("operator")?.kind() != "-" {
        return None;
    }
    let text = context.text(operand);
    let digits = text.trim_end_matches(['l', 'L']).replace('_', "");
    if digits.trim_start_matches('0').is_empty() {
        return None;
    }
    let long = text.ends_with(['l', 'L']);
    Some(Ce { key: format!("{}:-{digits}", if long { "J" } else { "I" }), shown: format!("-{digits}") })
}

fn literal(context: &Context, node: Node) -> Option<Ce> {
    let text = context.text(node);
    let (key, shown) = match node.kind() {
        "string_literal" => {
            let value = crate::java::types::expr::literal_text(context.file, node).unwrap_or_else(|| text.to_string());
            (format!("S:{value}"), value)
        }
        "true" | "false" => (format!("B:{text}"), text.to_string()),
        "null_literal" => ("null".to_string(), "null".to_string()),
        "character_literal" => (format!("C:{text}"), text.trim_matches('\'').to_string()),
        "decimal_integer_literal" => {
            let long = text.ends_with(['l', 'L']);
            let digits = text.trim_end_matches(['l', 'L']).replace('_', "");
            (format!("{}:{digits}", if long { "J" } else { "I" }), digits)
        }
        kind if kind.ends_with("_literal") => (format!("L:{text}"), text.to_string()),
        _ => return None,
    };
    Some(Ce { key, shown })
}
