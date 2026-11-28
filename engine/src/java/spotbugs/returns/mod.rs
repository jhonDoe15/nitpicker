//! RV_RETURN_VALUE_IGNORED_BAD_PRACTICE, RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT and BX_UNBOXING_IMMEDIATELY_REBOXED.
//! A call whose result the code drops (a call statement, the body of a lambda that returns nothing, a `for`
//! update) is reported once per method, called method and priority, on the first one's line, named after the
//! method javac gives the code. The bad-practice pattern takes the JDK methods of `jdk.rs` at priority 2 on a
//! receiver that is not an interface of the run. The no-side-effect pattern takes the JDK methods of `jdk.rs` and
//! the methods of the run that `effects.rs` and `settle.rs` find without side effects, at priority 2; priority 1
//! when the called method's result has the type of the method around (an assignable class, the same primitive but
//! `boolean`, the same array). Both take one more when an exception handler covers code all on the call's line,
//! and priority 3 is not reported. `void` methods, `equals(Object)`, methods marked to have their result ignored,
//! and overrides of a JDK method of the bad-practice pattern are not reported. A method of the run is named without
//! its package when it is in the caller's package; the SARIF place of a JDK method drops a `java.lang.` prefix.
mod boxes;
mod effects;
pub(in crate::java::spotbugs) mod jdk;
mod settle;

pub use settle::Effects;

use super::{Context, names};
use crate::engine::source::{children, parent};
use crate::java::types::expr::Call;
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

pub const BAD_PRACTICE: &str = "RV_RETURN_VALUE_IGNORED_BAD_PRACTICE";
pub const NO_SIDE_EFFECT: &str = "RV_RETURN_VALUE_IGNORED_NO_SIDE_EFFECT";
pub const PATTERNS: &[&str] = &[BAD_PRACTICE, NO_SIDE_EFFECT, boxes::PATTERN];
const BOUNDARIES: &[&str] = &["lambda_expression", "class_body", "method_declaration", "constructor_declaration"];

/// Whether an exception handler covers a node with a range of code all on the node's line, which SpotBugs takes as
/// a call made for its exceptions: the body of a `try` with a `catch` or a `finally` with code, a `catch` block of a
/// `try` with such a `finally`, the resources and body of a try-with-resources, a `synchronized` block or the body
/// of a method Lombok's `@Synchronized` wraps in one.
pub fn covered(context: &Context, node: Node) -> bool {
    let mut inner = node;
    let mut at = parent(node);
    let filled = |part: &Node| part.kind() == "finally_clause" && part.named_child(0).is_some_and(|block| block.named_child_count() > 0);
    while let Some(holder) = at {
        let locked = holder.kind() == "method_declaration" && super::lombok::annotated(context, holder, "Synchronized");
        if BOUNDARIES.contains(&holder.kind()) && !locked {
            return false;
        }
        let parts = children(holder);
        let finally = parts.iter().any(filled);
        let caught = parts.iter().any(|part| part.kind() == "catch_clause");
        let body = holder.child_by_field_name("body").filter(|body| body.id() == inner.id());
        let range = match holder.kind() {
            "try_statement" if caught || finally => body.map(|body| (body, body)),
            "try_with_resources_statement" => holder.child_by_field_name("resources").zip(holder.child_by_field_name("body")).filter(|_| body.is_some() || inner.kind() == "resource_specification"),
            "catch_clause" if parent(holder).is_some_and(|tried| children(tried).iter().any(filled)) => holder.child_by_field_name("body").map(|body| (body, body)),
            "synchronized_statement" => body.map(|body| (body, body)),
            "method_declaration" => match body {
                Some(body) => Some((body, body)),
                None => return false,
            },
            _ => None,
        };
        if let Some((first, last)) = range {
            let start = if first.kind() == "resource_specification" { Some(first) } else { statements(first).first().copied() };
            let end = statements(last).last().copied().or(start);
            let line = context.line(node);
            return start.is_some_and(|start| context.line(start) == line) && end.is_some_and(|end| context.line_at(end.end_byte().saturating_sub(1)) == line);
        }
        inner = holder;
        at = parent(holder);
    }
    false
}

fn statements(block: Node) -> Vec<Node> {
    crate::engine::source::named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

const STATEMENT_HOLDERS: [&str; 10] = ["block", "constructor_body", "switch_block_statement_group", "labeled_statement", "if_statement", "while_statement", "do_statement", "for_statement", "enhanced_for_statement", "expression_statement"];

/// Whether the code drops the value of a call or `new` expression.
fn dropped(context: &Context, node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    match holder.kind() {
        "expression_statement" => !parent(holder).is_some_and(|arm| arm.kind() == "switch_rule" && crate::engine::source::ancestor(arm, &["switch_expression", "switch_statement"]).is_some_and(|switch| switch.kind() == "switch_expression" && !parent(switch).is_some_and(|used| STATEMENT_HOLDERS.contains(&used.kind())))),
        "field_access" | "method_invocation" if holder.child_by_field_name("object").is_some_and(|object| object.id() == node.id()) => static_member(context, holder),
        "for_statement" => ["update", "init"].iter().any(|field| holder.children_by_field_name(field, &mut holder.walk()).any(|part| part.id() == node.id())),
        "lambda_expression" => {
            holder.child_by_field_name("body").is_some_and(|body| body.id() == node.id())
                && context.resolver.lambda_target(holder).and_then(|target| context.resolver.function_type(&target)).is_some_and(|(_, returned)| returned == Type::Primitive("void"))
        }
        _ => false,
    }
}

/// Whether a field read or call is static, so javac drops the value of the expression written before it.
fn static_member(context: &Context, holder: Node) -> bool {
    use crate::java::types::model::flag;
    if holder.kind() == "method_invocation" {
        return context.resolver.resolve_call(holder).is_some_and(|call| call.method.is_static);
    }
    let Some(name) = holder.child_by_field_name("field") else { return false };
    let Some(Type::Class(class, _)) = holder.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).map(|kind| kind.erased()) else { return false };
    context.resolver.index.field(&class, context.text(name)).is_some_and(|(_, field)| field.flags & flag::STATIC != 0)
}

/// The class the compiled call is made on: the type of the receiver, `Object` for its methods on an interface.
pub(super) fn made_on(context: &Context, call: &Call) -> String {
    let receiver = match &call.receiver {
        Type::Class(name, _) => name.split('&').next().unwrap_or(name).to_string(),
        _ => call.declaring.clone(),
    };
    let interface = context.resolver.index.get(&receiver).is_some_and(|info| info.is_interface);
    if call.method.is_static || call.method.name == "<init>" || (interface && call.declaring == "java.lang.Object") {
        return call.declaring.clone();
    }
    receiver
}

/// A class as a message names it from code of `from`: nothing for the same class, without the package for the
/// same package or `java.lang`.
pub(super) fn relative(from: &str, class: &str) -> String {
    let package = names::package_of(class);
    if from == class {
        String::new()
    } else if package == names::package_of(from) || package == "java.lang" {
        format!("{}.", names::short(class))
    } else {
        format!("{class}.")
    }
}

fn shown_parameters(context: &Context, call: &Call) -> String {
    call.method.parameters.iter().map(|kind| names::simple(context, kind)).collect::<Vec<_>>().join(", ")
}

/// The called method as SpotBugs names it: in full, and as the message shows it from the caller.
fn named(context: &Context, call: &Call, class: &str, caller: &str, node: Node) -> (String, String) {
    let mut listed = shown_parameters(context, call);
    let binary = names::binary(context, class);
    if call.method.name == "<init>" {
        let full = if children(node).iter().any(|part| part.kind() == "class_body") { Some(names::anonymous(context, class, node)) } else { local_constructor(context, call, class) };
        if let Some(inside) = full.as_deref().and_then(|full| full.split_once('(')).and_then(|(_, rest)| rest.strip_suffix(')')) {
            listed = inside.to_string();
        }
        let member = !class.split('.').any(|part| part.starts_with(|first: char| first.is_ascii_digit()));
        if let Some((outer, _)) = class.rsplit_once('.').filter(|_| member && crate::java::javac::inner_class(context.resolver, class)) {
            let outer = names::simple(context, &Type::class(outer));
            listed = if listed.is_empty() { outer } else { format!("{outer}, {listed}") };
        }
        let package = names::package_of(&binary);
        let near = package == names::package_of(caller) || package == "java.lang";
        let shown = if near { names::short(&binary) } else { binary.as_str() };
        return (format!("new {binary}({listed})"), format!("new {shown}({listed})"));
    }
    let full = format!("{binary}.{}({listed})", call.method.name);
    (full, format!("{}{}({listed})", relative(caller, &binary), call.method.name))
}

/// The constructor of a local class of the file as the compiler writes it: the instance around it, the declared
/// parameters, then the variables the class takes from the method.
fn local_constructor(context: &Context, call: &Call, class: &str) -> Option<String> {
    let declaration = *context.classes.get(class)?;
    let in_constructor = parent(declaration).is_some_and(|holder| holder.kind() == "constructor_body");
    if !crate::java::javac::declared_locally(declaration) && !in_constructor {
        return None;
    }
    let body = declaration.child_by_field_name("body")?;
    let parameters = jdk::parameters(&call.method.parameters);
    let constructor = super::place::members(body).into_iter().filter(|member| member.kind() == "constructor_declaration").find(|member| {
        let (erased, _, _) = context.resolver.parameters(member.child_by_field_name("parameters"));
        jdk::parameters(&erased) == parameters
    });
    let outer = crate::java::javac::instance_around(context.resolver, declaration);
    Some(names::method(context, class, constructor.unwrap_or(declaration), outer.as_deref()))
}

/// A call whose result is dropped, with what SpotBugs needs to judge it.
pub struct Dropped<'a> {
    pub node: Node<'a>,
    pub call: Call,
    pub labels: Vec<String>,
    pub line: usize,
}

fn call_of(context: &Context, node: Node) -> Option<Call> {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node),
        "object_creation_expression" => {
            let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
            let mut call = if anonymous {
                let own = context.resolver.scope.names.get(&node.id())?.clone();
                let mut call = context.resolver.resolve_constructor(node).or_else(|| context.resolver.resolve_call(node))?;
                call.declaring = own.clone();
                call.receiver = Type::class(&own);
                call.method.parameters = Vec::new();
                call.method.is_static = false;
                call
            } else {
                context.resolver.resolve_constructor(node)?
            };
            call.method.name = "<init>".to_string();
            Some(call)
        }
        _ => None,
    }
}

pub(super) fn dropped_calls<'a>(context: &Context<'a>) -> Vec<Dropped<'a>> {
    let mut found = Vec::new();
    crate::engine::source::walk(context.file.tree.root_node(), |node| {
        if !matches!(node.kind(), "method_invocation" | "object_creation_expression") || !dropped(context, node) {
            return;
        }
        let Some(call) = call_of(context, node) else { return };
        let labels = super::place::methods(context, node);
        let line = match node.child_by_field_name("arguments") {
            Some(arguments) if node.kind() == "method_invocation" => context.line(arguments),
            _ => context.line(node),
        };
        found.push(Dropped { node, call, labels, line });
    });
    found
}

/// Whether the result of the called method has the type of the method around the call, which SpotBugs takes as a
/// lost return value.
fn lost_return(context: &Context, node: Node, call: &Call) -> bool {
    let Some(around) = context.resolver.returned_type(node).map(|kind| kind.erased()) else { return false };
    let returned = if call.method.name == "<init>" { Type::class(&call.declaring) } else { call.method.returns.erased() };
    match (&returned, &around) {
        (Type::Primitive(one), Type::Primitive(two)) => one == two && *one != "boolean",
        (Type::Class(one, _), Type::Class(two, _)) => context.resolver.index.is_subtype(one, two),
        (Type::Array(_), Type::Array(_)) => returned == around,
        _ => false,
    }
}

/// A call whose result SpotBugs never takes as lost: a `void` method, `equals(Object)`, an override of a JDK method whose result
/// should be checked (SpotBugs takes it as such at priority 3), or one marked, or in a class marked, with
/// `@CanIgnoreReturnValue`.
fn ignorable(context: &Context, call: &Call) -> bool {
    let marked = |flags: u32| flags & crate::java::types::model::flag::IGNORE_RESULT != 0;
    let void = call.method.name != "<init>" && call.method.returns == Type::Primitive("void");
    let index = context.resolver.index;
    let parameters = jdk::parameters(&call.method.parameters);
    let overrides_checked = index.from_source(&call.declaring)
        && index.lineage(&call.declaring).iter().filter(|above| !index.from_source(above)).any(|above| jdk::known(above, &call.method.name, &parameters).is_some_and(|known| known.checked));
    let equals = call.method.name == "equals" && parameters == "java.lang.Object";
    void || equals || overrides_checked || marked(call.method.flags) || context.resolver.index.get(&call.declaring).is_some_and(|info| marked(info.flags))
}

/// The file's dropped results: bad-practice findings at once, the rest for `Effects` to settle with the whole run.
pub fn returns(context: &Context, effects: &Effects) {
    if context.wants(&[boxes::PATTERN]) {
        boxes::boxes(context);
    }
    let bad = context.wants(&[BAD_PRACTICE]);
    let side = context.wants(&[NO_SIDE_EFFECT]);
    if side {
        effects.note(effects::summaries(context));
        effects.refer(settle::referenced(context));
    }
    if !bad && !side {
        return;
    }
    let package = context.resolver.scope.package.clone();
    let mut seen = HashSet::new();
    let mut waiting = Vec::new();
    for dropped in dropped_calls(context) {
        let call = &dropped.call;
        let on = made_on(context, call);
        let from_source = context.resolver.index.from_source(&on);
        let lookup = if from_source { call.declaring.clone() } else { on.clone() };
        let parameters = jdk::parameters(&call.method.parameters);
        let object = call.declaring == "java.lang.Object" && call.method.name == "<init>";
        let known = if object {
            Some(jdk::Known { ignored: true, pure: true, ..jdk::Known::default() })
        } else if context.resolver.index.from_source(&call.declaring) {
            None
        } else {
            jdk::known(&lookup, &call.method.name, &parameters)
        };
        let caller = crate::java::types::scope::enclosing_types(context.resolver.scope, dropped.node).first().map(|own| names::binary(context, own)).unwrap_or_default();
        let named_class = known.and_then(|known| known.named).map(str::to_string).unwrap_or_else(|| if known.is_some() { lookup.clone() } else { call.declaring.clone() });
        let (full, shown) = named(context, call, &named_class, &caller, dropped.node);
        let covered = covered(context, dropped.node);
        let through_interface = from_source && context.resolver.index.get(&call.declaring).is_some_and(|info| info.is_interface);
        for label in &dropped.labels {
            if bad && !covered && !through_interface && known.is_some_and(|known| known.checked) && seen.insert((BAD_PRACTICE, label.clone(), full.clone(), 2)) {
                let message = format!("Exceptional return value of {full} ignored in {label}");
                let place = format!("function:{full}|{package}@{full}");
                context.report_listed(BAD_PRACTICE, dropped.node, dropped.line, message, place, 2, vec![full.clone(), label.clone()]);
            }
            if !side || ignorable(context, call) {
                continue;
            }
            let priority = if lost_return(context, dropped.node, call) { 1 } else { 2 } + u8::from(covered);
            if priority > 2 || !seen.insert((NO_SIDE_EFFECT, label.clone(), full.clone(), priority)) {
                continue;
            }
            let listed = if known.is_some() { shown.clone() } else { full.clone() };
            let message = format!("Return value of {shown} ignored, but method has no side effect");
            let place = format!("function:{}|{package}@{shown}", listed.strip_prefix("java.lang.").unwrap_or(&listed));
            let Some(finding) = context.finding_listed(NO_SIDE_EFFECT, dropped.node, dropped.line, message, place, vec![shown.clone()]) else { continue };
            let finding = crate::engine::finding::Finding { priority: Some(priority), ..finding };
            match known {
                Some(known) if known.ignored => match known.named {
                    Some(named) if named != lookup => waiting.push((settle::Wait::Referenced(named.to_string()), finding)),
                    _ => context.push(finding),
                },
                Some(_) => {}
                None if context.resolver.index.from_source(&call.declaring) => waiting.push((settle::Wait::Run(effects::key_of(call)), finding)),
                None => {}
            }
        }
    }
    effects.wait(waiting);
}
