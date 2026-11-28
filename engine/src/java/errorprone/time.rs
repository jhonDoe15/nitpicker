//! PreferJavaTimeOverload: a call passes a number, a number with a time unit or a Joda value where the same
//! method also takes a `java.time` value.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
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

fn time_unit<'c>(context: &'c Context, argument: Node) -> Option<&'c str> {
    let name = match argument.kind() {
        "identifier" => context.text(argument),
        "field_access" => argument.child_by_field_name("field").map(|field| context.text(field))?,
        _ => return None,
    };
    UNITS.iter().find(|unit| **unit == name).copied()
}

const DECOMPOSITIONS: [&str; 7] = ["toNanos", "toMillis", "toSeconds", "toMinutes", "toHours", "toDays", "getSeconds"];

/// `foo(duration.getSeconds(), SECONDS)` becomes `foo(duration)`, other pairs `foo(Duration.ofSeconds(n))`.
fn unit_fix(context: &Context, arguments: &[Node], unit: &str) -> Fix {
    let mut fix = Fix::new();
    let duration = qualify_type(context, arguments[0], DURATION, &mut fix);
    let value = context.text(arguments[0]);
    let mut replacement = None;
    let first = arguments[0];
    let decomposing = first.kind() == "method_invocation"
        && first.child_by_field_name("name").is_some_and(|name| DECOMPOSITIONS.contains(&context.text(name)))
        && context.resolver.resolve_call(first).is_some_and(|call| !call.method.is_static && call.receiver.name() == DURATION);
    if let (true, Some(receiver)) = (decomposing, first.child_by_field_name("object")) {
        replacement = Some(context.text(receiver).to_string());
    }
    if unit == "MICROSECONDS" {
        let chrono = qualify_type(context, arguments[0], "java.time.temporal.ChronoUnit", &mut fix);
        replacement = Some(format!("{duration}.of({value}, {chrono}.MICROS)"));
    }
    let factory = match unit {
        "NANOSECONDS" => "ofNanos",
        "MILLISECONDS" => "ofMillis",
        "SECONDS" => "ofSeconds",
        "MINUTES" => "ofMinutes",
        "HOURS" => "ofHours",
        _ => "ofDays",
    };
    let text = replacement.unwrap_or_else(|| format!("{duration}.{factory}({value})"));
    fix.and(arguments[0].start_byte(), arguments[1].end_byte(), text)
}

const JODA_FACTORIES: [(&str, &str); 6] = [
    ("<init>", "ofMillis"),
    ("millis", "ofMillis"),
    ("standardSeconds", "ofSeconds"),
    ("standardMinutes", "ofMinutes"),
    ("standardHours", "ofHours"),
    ("standardDays", "ofDays"),
];

/// The first argument of a creation or call that stands for `class`, when it is a call of one of `names`.
fn built_from<'t>(context: &Context, arg: Node<'t>, class: &str, names: &[&str]) -> Option<(&'static str, Node<'t>)> {
    if !matches!(arg.kind(), "method_invocation" | "object_creation_expression") {
        return None;
    }
    let (resolved, _) = context.resolver.call_formals(arg)?;
    let method = &resolved.method;
    let named = if arg.kind() == "method_invocation" { method.name.as_str() } else { "<init>" };
    let listed = names.iter().find(|wanted| **wanted == named)?;
    let fits = if arg.kind() == "method_invocation" { method.is_static && resolved.declaring == class } else { resolved.declaring == class && method.parameters.len() == 1 && method.parameters[0].name() == "long" };
    let first = arg.child_by_field_name("arguments")?.named_child(0)?;
    fits.then_some(JODA_FACTORIES.iter().find(|(own, _)| own == listed).map_or("ofMillis", |(_, factory)| factory)).map(|factory| (factory, first))
}

fn joda_duration_fix(context: &Context, arg: Node) -> Fix {
    let mut fix = Fix::new();
    let duration = qualify_type(context, arg, DURATION, &mut fix);
    let names: Vec<&str> = JODA_FACTORIES.iter().map(|(name, _)| *name).collect();
    if let Some((factory, value)) = built_from(context, arg, "org.joda.time.Duration", &names) {
        return fix.and(arg.start_byte(), arg.end_byte(), format!("{duration}.{factory}({})", context.text(value)));
    }
    if let Some(inner) = unwrapped(context, arg, "toJodaDuration") {
        return fix.and(arg.start_byte(), arg.end_byte(), context.text(inner).to_string());
    }
    fix.and(arg.start_byte(), arg.end_byte(), format!("{duration}.ofMillis({}.getMillis())", context.text(arg)))
}

fn joda_instant_fix(context: &Context, arg: Node) -> Fix {
    let mut fix = Fix::new();
    let instant = qualify_type(context, arg, INSTANT, &mut fix);
    let created = arg.kind() == "object_creation_expression"
        && context.resolver.call_formals(arg).is_some_and(|(resolved, _)| {
            resolved.declaring == "org.joda.time.Instant" && resolved.method.parameters.len() == 1 && resolved.method.parameters[0].name() == "long"
        });
    if let (true, Some(value)) = (created, arg.child_by_field_name("arguments").and_then(|list| list.named_child(0))) {
        return fix.and(arg.start_byte(), arg.end_byte(), format!("{instant}.ofEpochMilli({})", context.text(value)));
    }
    if let Some(inner) = unwrapped(context, arg, "toJodaInstant") {
        return fix.and(arg.start_byte(), arg.end_byte(), context.text(inner).to_string());
    }
    fix.and(arg.start_byte(), arg.end_byte(), format!("{instant}.ofEpochMilli({}.getMillis())", context.text(arg)))
}

/// The argument of a `JavaTimeConversions` call that turns a `java.time` value into a Joda one.
fn unwrapped<'t>(context: &Context, arg: Node<'t>, name: &str) -> Option<Node<'t>> {
    if arg.kind() != "method_invocation" || arg.child_by_field_name("name").is_none_or(|called| context.text(called) != name) {
        return None;
    }
    let call = context.resolver.resolve_call(arg)?;
    let conversion = call.method.is_static && call.declaring == "com.google.thirdparty.jodatime.JavaTimeConversions";
    conversion.then(|| arg.child_by_field_name("arguments")?.named_child(0))?
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
    let unit = if timed && arguments.len() == 2 { time_unit(context, arguments[1]) } else { None };
    let fix = if let (Some(unit), true) = (unit, overload(DURATION)) {
        unit_fix(context, &arguments, unit)
    } else if joda("org.joda.time.ReadableDuration", DURATION) {
        joda_duration_fix(context, arguments[0])
    } else if joda("org.joda.time.ReadableInstant", INSTANT) {
        joda_instant_fix(context, arguments[0])
    } else {
        return;
    };
    context.report_fixed(NAME, node, list.start_byte(), SUMMARY, &[fix]);
}
