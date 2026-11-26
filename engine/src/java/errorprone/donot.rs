//! DoNotCall.
use super::fix_helpers::add_modifiers;
use super::fixes::Fix;
use super::hierarchy::{closure, declared_method, super_methods};
use super::keep::annotations;
use super::nodes::{name_position, position};
use super::vars::{Named, named};
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Call;
use crate::java::types::model::{ClassInfo, Method, Type, flag};
use tree_sitter::Node;

const DO_NOT_CALL: &str = "com.google.errorprone.annotations.DoNotCall";

fn annotated(method: &Method) -> bool {
    method.detail.annotations.iter().any(|name| name == DO_NOT_CALL)
}

/// Whether a method that is not abstract could be overridden: not static, private, final or a constructor, in a class that is not final or anonymous.
fn can_be_overridden(context: &Context, node: Node, info: &ClassInfo, method: &Method) -> bool {
    if has_modifier(node, "abstract") || method.is_abstract {
        return true;
    }
    if method.is_static || method.is_private || has_modifier(node, "final") || method.name == "<init>" {
        return false;
    }
    let constants_with_bodies = info.enum_constants.is_some() && has_constant_body(context, node);
    let final_class = info.flags & (flag::FINAL | flag::RECORD) != 0 || (info.enum_constants.is_some() && !constants_with_bodies);
    !final_class && !info.name.rsplit('.').next().is_some_and(|last| last.starts_with(|first: char| first.is_ascii_digit()))
}

fn has_constant_body(_context: &Context, method: Node) -> bool {
    let mut current = parent(method);
    while let Some(above) = current {
        if above.kind() == "enum_declaration" {
            let mut found = false;
            walk(above, |part| found |= part.kind() == "enum_constant" && children(part).iter().any(|inner| inner.kind() == "class_body"));
            return found;
        }
        current = parent(above);
    }
    false
}

thread_local! {
    static INHERITS: std::cell::RefCell<std::collections::HashMap<String, bool>> = std::cell::RefCell::new(std::collections::HashMap::new());
}

/// Whether a class or one of its supertypes declares a method annotated `@DoNotCall`.
fn inherits_annotated(context: &Context, class: &str) -> bool {
    if let Some(known) = INHERITS.with(|cache| cache.borrow().get(class).copied()) {
        return known;
    }
    let index = context.resolver.index;
    let found = index.get(class).is_some_and(|info| info.methods.iter().any(annotated)) || closure(index, class).iter().any(|parent| index.get(parent).is_some_and(|info| info.methods.iter().any(annotated)));
    INHERITS.with(|cache| cache.borrow_mut().insert(class.to_string(), found));
    found
}

pub fn do_not_call_method(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some(owner) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node) else { return };
    if !has_modifier_annotation(context, node) && !inherits_annotated(context, &owner) {
        return;
    }
    let Some((info, method)) = declared_method(context, node) else { return };
    let at = name_position(node);
    if annotations(context, node).iter().any(|name| name == DO_NOT_CALL) {
        if has_modifier(node, "private") {
            context.report_fixed("DoNotCall", node, at, "A private method that should not be called should simply be removed.", &[]);
            return;
        }
        if has_modifier(node, "abstract") || method.is_abstract || !can_be_overridden(context, node, info, method) {
            return;
        }
        let fix = add_modifiers(Fix::new(), node, &["final"]);
        context.report_fixed("DoNotCall", node, at, "Methods annotated with @DoNotCall should be final or static.", &[fix]);
        return;
    }
    let found = super_methods(context.resolver.index, info, method).into_iter().find(|(_, other)| annotated(other));
    if let Some((owner, other)) = found {
        let message = format!("Method overrides {} in {} which is annotated @DoNotCall, it should also be annotated.", other.name, super::hierarchy::simple_name(&owner.name));
        let fix = Fix::new().insert(node.start_byte(), "@DoNotCall ").with_imports();
        context.report_fixed("DoNotCall", node, at, &message, &[fix]);
    }
}

fn has_modifier_annotation(context: &Context, node: Node) -> bool {
    crate::java::helpers::modifiers(node).is_some_and(|modifiers| children(modifiers).iter().any(|part| part.kind().ends_with("annotation") && context.text(*part).contains("DoNotCall")))
}

pub(super) fn owner_type(call: Node, resolved: &Call) -> String {
    let object = if call.kind() == "method_reference" { call.child(0) } else { call.child_by_field_name("object") };
    match object {
        Some(object) if object.kind() != "super" => resolved.receiver.name(),
        _ => resolved.declaring.clone(),
    }
}

fn returns_class(owner: &str, class: &str) -> bool {
    owner == class
}

const EXACT_GET_CLASS: &[(&str, &str)] = &[
    ("java.lang.StackTraceElement", "Calling getClass on StackTraceElement returns the Class object for StackTraceElement, you probably meant to retrieve the class containing the execution point represented by this stack trace element using getClassName"),
    ("java.lang.StackWalker", "Calling getClass on StackWalker returns the Class object for StackWalker, you probably meant to retrieve the class containing the execution point represented by this StackWalker using getCallerClass"),
    ("java.lang.reflect.Constructor", "Calling getClass on Constructor returns the Class object for Constructor, you probably meant to retrieve the class containing the constructor represented by this Constructor using getDeclaringClass"),
    ("java.lang.reflect.Field", "Calling getClass on Field returns the Class object for Field, you probably meant to retrieve the class containing the field represented by this Field using getDeclaringClass"),
    ("java.lang.reflect.Method", "Calling getClass on Method returns the Class object for Method, you probably meant to retrieve the class containing the method represented by this Method using getDeclaringClass"),
    ("java.lang.reflect.ParameterizedType", "Calling getClass on ParameterizedType returns the Class object for ParameterizedType, you probably meant to retrieve the class containing the method represented by this ParameterizedType using getRawType"),
    ("java.beans.BeanDescriptor", "Calling getClass on BeanDescriptor returns the Class object for BeanDescriptor, you probably meant to retrieve the class described by this BeanDescriptor using getBeanClass"),
];

fn names(call: &Call) -> Vec<String> {
    call.method.parameters.iter().map(|kind| kind.name()).collect()
}

/// The explanation Error Prone lists for a method it cannot annotate, in the order of its table.
fn third_party(context: &Context, node: Node, call: &Call) -> Option<String> {
    let index = context.resolver.index;
    let name = call.method.name.as_str();
    if !matches!(
        name,
        "isEqualTo" | "isNotEqualTo" | "assertEquals" | "stop" | "getHours" | "getMinutes" | "getSeconds" | "setHours" | "setMinutes" | "setSeconds" | "toInstant" | "getYear" | "getMonth" | "getDay" | "getDate" | "setYear" | "setMonth" | "setDate" | "putFirst" | "putLast" | "addFirst" | "addLast" | "setSeed" | "newCondition" | "getClass" | "run"
    ) {
        return None;
    }
    let owner = owner_type(node, call);
    let owner = owner.as_str();
    let params = names(call);
    let instance = !call.method.is_static;
    if instance && owner == "com.google.common.truth.extensions.proto.LiteProtoSubject" && matches!(name, "isEqualTo" | "isNotEqualTo") && params == ["com.google.protobuf.MessageLite.Builder"] {
        let argument = node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().find(|part| !part.kind().ends_with("comment"));
        if argument.is_some_and(|argument| argument.kind() != "null_literal") {
            return Some("A Builder can never compare equal to a MessageLite instance. Use `build()`, or `buildPartial()` on the argument to get a `MessageLite` for comparison instead. Or, if you are passing `null`, use `isNull()`.".to_string());
        }
    }
    if call.method.is_static && owner == "org.junit.Assert" && name == "assertEquals" {
        if params == ["double", "double"] {
            return Some("This method always throws java.lang.AssertionError. Use assertEquals(expected, actual, delta) to compare floating-point numbers".to_string());
        }
        if params == ["java.lang.String", "double", "double"] {
            return Some("This method always throws java.lang.AssertionError. Use assertEquals(String, expected, actual, delta) to compare floating-point numbers".to_string());
        }
    }
    if instance && owner == "java.lang.Thread" && name == "stop" && params == ["java.lang.Throwable"] {
        return Some("Thread.stop(Throwable) always throws an UnsupportedOperationException".to_string());
    }
    if instance && owner == "java.sql.Date" && matches!(name, "getHours" | "getMinutes" | "getSeconds" | "setHours" | "setMinutes" | "setSeconds") {
        return Some("The hour/minute/second getters and setters on java.sql.Date are guaranteed to throw IllegalArgumentException because java.sql.Date does not have a time component.".to_string());
    }
    if instance && owner == "java.sql.Date" && name == "toInstant" {
        return Some("sqlDate.toInstant() is not supported. Did you mean to call toLocalDate() instead?".to_string());
    }
    if instance && owner == "java.sql.Time" && matches!(name, "getYear" | "getMonth" | "getDay" | "getDate" | "setYear" | "setMonth" | "setDate") {
        return Some("The year/month/day getters and setters on java.sql.Time are guaranteed to throw IllegalArgumentException because java.sql.Time does not have a date component.".to_string());
    }
    if instance && owner == "java.sql.Time" && name == "toInstant" {
        return Some("sqlTime.toInstant() is not supported. Did you mean to call toLocalTime() instead?".to_string());
    }
    if instance && index.is_subtype(owner, "java.util.SortedMap") && matches!(name, "putFirst" | "putLast") {
        return Some("Sorted collections do not support insertions with explicit positioning".to_string());
    }
    if instance && index.is_subtype(owner, "java.util.SortedSet") && matches!(name, "addFirst" | "addLast") {
        return Some("Sorted collections do not support insertions with explicit positioning".to_string());
    }
    if instance && owner == "java.util.concurrent.ThreadLocalRandom" && name == "setSeed" {
        return Some("ThreadLocalRandom does not support setting a seed.".to_string());
    }
    if instance && owner == "java.util.concurrent.locks.ReentrantReadWriteLock.ReadLock" && name == "newCondition" {
        return Some("ReadLocks do not support conditions.".to_string());
    }
    if instance && name == "getClass" {
        if let Some((_, message)) = EXACT_GET_CLASS.iter().find(|(class, _)| returns_class(owner, class)) {
            return Some((*message).to_string());
        }
        if index.is_subtype(owner, "java.lang.management.LockInfo") {
            return Some("Calling getClass on LockInfo returns the Class object for LockInfo, you probably meant to retrieve the class of the object that is being locked using getClassName".to_string());
        }
        if index.is_subtype(owner, "com.google.common.reflect.TypeToken") {
            return Some("Calling getClass on TypeToken returns the Class object for TypeToken, you probably meant to retrieve the class described by this TypeToken using getRawType".to_string());
        }
    }
    let on_super = node.kind() == "method_invocation" && node.child_by_field_name("object").is_some_and(|object| object.kind() == "super");
    if instance && name == "run" && params.is_empty() && index.is_subtype(owner, "java.lang.Thread") && !on_super {
        return Some("Calling run on Thread runs work on this thread, rather than the given thread, you probably meant to call start".to_string());
    }
    None
}

/// The text of the string given to `@DoNotCall`, read from the declaration when this file has it.
fn value_of(context: &Context, call: &Call) -> String {
    let mut found = String::new();
    walk(context.file.tree.root_node(), |node| {
        if node.kind() != "method_declaration" || !found.is_empty() {
            return;
        }
        let Some((info, method)) = declared_method(context, node) else { return };
        if info.name != call.declaring || method.parameters != call.method.parameters || method.name != call.method.name {
            return;
        }
        for annotation in crate::java::helpers::modifiers(node).map(children).unwrap_or_default() {
            if annotation.kind() != "annotation" || annotation.child_by_field_name("name").is_none_or(|name| !context.text(name).ends_with("DoNotCall")) {
                continue;
            }
            walk(annotation, |part| {
                if part.kind() == "string_literal" && found.is_empty() {
                    found = crate::java::types::expr::literal_text(context.file, part).unwrap_or_default();
                }
            });
        }
    });
    found
}

fn symbol_text(call: &Call) -> String {
    let generics = if call.method.type_parameters.is_empty() { String::new() } else { format!("<{}>", call.method.type_parameters.join(",")) };
    format!("{generics}{}({})", call.method.name, call.method.shown)
}

fn describe(context: &Context, node: Node, call: &Call, at: usize) {
    let value = value_of(context, call);
    let mut message = format!("{}.{} should not be called", call.declaring, symbol_text(call));
    if value.is_empty() {
        message.push_str(", see its documentation for details.");
    } else {
        message.push_str(&format!(": {value}"));
    }
    context.report_fixed("DoNotCall", node, at, &message, &[]);
}

/// Whether a variable is final, or never given a value again.
pub(super) fn considered_final(context: &Context, declarator: Node) -> bool {
    let Some(declaration) = parent(declarator) else { return false };
    if has_modifier(declaration, "final") {
        return true;
    }
    if declaration.kind() != "local_variable_declaration" {
        return false;
    }
    let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    let Some(scope) = parent(declaration) else { return false };
    let mut assigned = false;
    walk(scope, |part| {
        let target = match part.kind() {
            "assignment_expression" => part.child_by_field_name("left"),
            "update_expression" => part.named_child(0),
            _ => None,
        };
        assigned |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
    });
    !assigned
}

/// Uses of a variable that is never given another value and holds an object of a class with an annotated method.
fn through_declaration(context: &Context, declarator: Node) {
    let (Some(value), Some(name)) = (declarator.child_by_field_name("value"), declarator.child_by_field_name("name")) else { return };
    let Some(scope) = parent(declarator).filter(|holder| matches!(holder.kind(), "local_variable_declaration" | "field_declaration")).and_then(parent) else { return };
    let Some(Type::Class(seen, _)) = context.resolver.type_of(value) else { return };
    if !inherits_annotated(context, &seen) || !considered_final(context, declarator) {
        return;
    }
    let index = context.resolver.index;
    let name = context.text(name);
    walk(scope, |node| {
        if node.kind() != "method_invocation" {
            return;
        }
        let Some(object) = node.child_by_field_name("object").filter(|object| object.kind() == "identifier" && context.text(*object) == name) else { return };
        if !matches!(named(context, object), Some(Named::Variable(found)) if found.id() == declarator.id()) {
            return;
        }
        let Some(call) = context.resolver.resolve_call(node) else { return };
        if call.method.is_static || annotated(&call.method) {
            return;
        }
        let mut classes = vec![seen.clone()];
        classes.extend(closure(index, &seen));
        for class in classes {
            let Some(info) = index.get(&class) else { continue };
            let found = info.methods.iter().find(|method| method.name == call.method.name && method.parameters == call.method.parameters && !method.is_static && annotated(method));
            if let Some(method) = found {
                let through = Call { raw: false, receiver: call.receiver.clone(), declaring: info.name.clone(), method: method.clone() };
                describe(context, node, &through, position(node));
                return;
            }
        }
    });
}

/// The method a method reference names, when it is the same for every arity that fits.
fn reference_call(context: &Context, node: Node) -> Option<Call> {
    let mut found: Option<Call> = None;
    for count in 0..4 {
        let taken = vec![Type::Variable("T".to_string()); count];
        let Some((owner, info, method, _)) = context.resolver.reference_method(node, &taken) else { continue };
        let call = Call { raw: false, receiver: owner, declaring: info.name.clone(), method: method.clone() };
        match &found {
            Some(first) if first.method.parameters != call.method.parameters || first.declaring != call.declaring => return None,
            Some(_) => {}
            None => found = Some(call),
        }
    }
    found
}

pub fn do_not_call_use(context: &Context, node: Node) {
    if node.kind() == "variable_declarator" {
        through_declaration(context, node);
        return;
    }
    let call = match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node),
        "method_reference" => reference_call(context, node),
        _ => None,
    };
    let Some(call) = call else { return };
    let at = if node.kind() == "method_invocation" { position(node) } else { node.start_byte() };
    if let Some(message) = third_party(context, node, &call) {
        context.report_fixed("DoNotCall", node, at, &message, &[]);
        return;
    }
    if call.method.detail.annotations.iter().any(|name| name == DO_NOT_CALL) {
        describe(context, node, &call, at);
        return;
    }
}
