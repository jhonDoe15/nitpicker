//! PreferJavaTimeOverload: a call passes a number, a number with a time unit or a Joda value where the same
//! method also takes a `java.time` value.
use super::Context;
use super::hierarchy::{declared_method, super_methods};
use crate::engine::source::{ancestor, named_children};
use crate::java::types::model::{ClassInfo, Method, Type};
use tree_sitter::Node;

const NAME: &str = "PreferJavaTimeOverload";
const SUMMARY: &str = "Prefer using java.time-based APIs when available. Note that this checker does not and cannot guarantee that the overloads have equivalent semantics, but that is generally the case with overloaded methods.";
const DURATION: &str = "java.time.Duration";
const INSTANT: &str = "java.time.Instant";
const UNITS: [&str; 7] = ["NANOSECONDS", "MICROSECONDS", "MILLISECONDS", "SECONDS", "MINUTES", "HOURS", "DAYS"];

/// Another method of the same name that takes just the wanted type and gives the same result.
fn has_overload(context: &Context, call: Node, declaring: &ClassInfo, called: &Method, wanted: &str) -> bool {
    let index = context.resolver.index;
    let around = ancestor(call, &["method_declaration"]).and_then(|method| declared_method(context, method));
    let mut classes = vec![declaring.name.clone()];
    classes.extend(super::hierarchy::closure(index, &declaring.name));
    classes.iter().filter_map(|class| index.get(class)).any(|class| {
        class.methods.iter().filter(|input| input.name == called.name).any(|input| {
            let same = |info: &ClassInfo, method: &Method| info.name == class.name && method.parameters == input.parameters;
            if same(declaring, called) || input.is_static != called.is_static || input.parameters.len() != 1 {
                return false;
            }
            if input.parameters[0].name() != wanted || input.returns != called.returns {
                return false;
            }
            around.is_none_or(|(origin, method)| {
                !same(origin, method) && !super_methods(index, origin, method).iter().any(|(info, above)| same(info, above))
            })
        })
    })
}

fn ignored(context: &Context, declaring: &ClassInfo, method: &Method, receiver: &Type) -> bool {
    if method.is_static {
        return declaring.name == "org.jooq.impl.DSL" || declaring.name.starts_with("org.assertj.");
    }
    context.resolver.index.is_subtype(&receiver.name(), "reactor.core.publisher.Flux")
}

fn time_unit(context: &Context, argument: Node) -> bool {
    let name = match argument.kind() {
        "identifier" => context.text(argument),
        "field_access" => argument.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default(),
        _ => return false,
    };
    UNITS.contains(&name)
}

pub fn prefer_java_time_overload(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(list) = node.child_by_field_name("arguments") else { return };
    let arguments: Vec<Node> = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.is_empty() || arguments.len() > 2 {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let index = context.resolver.index;
    let method = &resolved.method;
    let Some(declaring) = index.get(&resolved.declaring) else { return };
    if method.parameters.is_empty() || method.parameters.len() > 2 || ignored(context, declaring, method, &resolved.receiver) {
        return;
    }
    let overload = |wanted: &str| has_overload(context, node, declaring, method, wanted);
    let first = method.parameters[0].name();
    let single = method.parameters.len() == 1;
    if single && matches!(first.as_str(), "int" | "long" | "double") {
        for (wanted, short) in [(DURATION, "Duration"), (INSTANT, "Instant")] {
            if overload(wanted) {
                let end = node.child_by_field_name("name").map_or(list.start_byte(), |name| name.end_byte());
                let select = &context.file.text[node.start_byte()..end];
                let message = format!(
                    "If the numeric primitive ({}) represents a {short}, please call {}({short}) instead.",
                    context.text(arguments[0]),
                    select
                );
                context.report(NAME, node, list.start_byte(), &message);
                return;
            }
        }
    }
    let timed = !single && first == "long" && method.parameters[1].name() == "java.util.concurrent.TimeUnit";
    let joda = |above: &str, wanted: &str| single && index.is_subtype(&first, above) && overload(wanted);
    if (timed && arguments.len() == 2 && time_unit(context, arguments[1]) && overload(DURATION))
        || joda("org.joda.time.ReadableDuration", DURATION)
        || joda("org.joda.time.ReadableInstant", INSTANT)
    {
        context.report(NAME, node, list.start_byte(), SUMMARY);
    }
}
