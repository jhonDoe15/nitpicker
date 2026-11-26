//! The fixes DefaultLocale suggests: pass a locale, or move to the call that takes one.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
use super::values::value_name;
use crate::engine::source::{named_children, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

#[derive(Clone, Copy)]
pub enum Locale {
    Root,
    Default,
    Format,
    Display,
}

pub const FORMATTING: [Locale; 3] = [Locale::Root, Locale::Default, Locale::Format];
pub const PLAIN: [Locale; 2] = [Locale::Root, Locale::Default];
pub const DISPLAYING: [Locale; 3] = [Locale::Root, Locale::Default, Locale::Display];

/// A static import of a constant: its simple name, or the class-qualified name when the file uses the name for something else.
pub fn qualify_static_import(context: &Context, at: Node, qualified: &str, fix: &mut Fix) -> String {
    let (class, name) = qualified.rsplit_once('.').unwrap_or_default();
    let scope = context.resolver.scope;
    let imported = scope.static_single.get(name).is_some_and(|owners| owners.iter().any(|owner| owner == class))
        || scope.static_on_demand.iter().any(|owner| owner == class);
    let mut conflict = false;
    walk(context.file.tree.root_node(), |part| {
        let used = match part.kind() {
            "identifier" | "type_identifier" => value_name(part) || part.parent().is_some_and(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object").is_none()),
            _ => false,
        };
        let declared = part.kind() == "method_declaration" && part.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
        conflict |= declared || (used && context.text(part) == name && !imported);
    });
    if conflict {
        return format!("{}.{name}", qualify_type(context, at, class, fix));
    }
    *fix = std::mem::take(fix).with_imports();
    name.to_string()
}

fn replacement(context: &Context, at: Node, fix: &mut Fix, locale: Locale) -> String {
    *fix = std::mem::take(fix).with_imports();
    match locale {
        Locale::Root => "Locale.ROOT".to_string(),
        Locale::Default => "Locale.getDefault()".to_string(),
        Locale::Format => format!("Locale.getDefault({})", qualify_static_import(context, at, "java.util.Locale.Category.FORMAT", fix)),
        Locale::Display => format!("Locale.getDefault({})", qualify_static_import(context, at, "java.util.Locale.Category.DISPLAY", fix)),
    }
}

/// One fix for each locale choice; `build` gets the fix, the node and the text that names the locale.
pub fn each(context: &Context, at: Node, locales: &[Locale], build: impl Fn(Fix, &str) -> Fix) -> Vec<Fix> {
    locales
        .iter()
        .map(|locale| {
            let mut fix = Fix::new();
            let text = replacement(context, at, &mut fix, *locale);
            build(fix, &text)
        })
        .collect()
}

pub fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let list = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    list.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The end of what is called: the method name, or the written class of a creation.
pub fn select_end(call: Node) -> usize {
    let select = if call.kind() == "object_creation_expression" { call.child_by_field_name("type") } else { call.child_by_field_name("name") };
    select.map_or(call.end_byte(), |select| select.end_byte())
}

/// The locale goes in front of the arguments.
pub fn prepended(context: &Context, call: Node, locales: &[Locale]) -> Vec<Fix> {
    let given = arguments(call);
    each(context, call, locales, |fix, text| match given.first() {
        Some(first) => fix.insert(first.start_byte(), format!("{text}, ")),
        None => fix.and(select_end(call), call.end_byte(), format!("({text})")),
    })
}

/// The locale goes after the arguments.
pub fn appended(context: &Context, call: Node, locales: &[Locale]) -> Vec<Fix> {
    let given = arguments(call);
    each(context, call, locales, |fix, text| match given.last() {
        Some(last) => fix.insert(last.end_byte(), format!(", {text}")),
        None => fix.and(select_end(call), call.end_byte(), format!("({text})")),
    })
}

fn joined(context: &Context, nodes: &[Node]) -> String {
    nodes.iter().map(|node| context.text(*node)).collect::<Vec<&str>>().join(", ")
}

fn replaced(call: Node, text: String) -> impl Fn(Fix) -> Fix {
    move |fix| fix.and(call.start_byte(), call.end_byte(), text.clone())
}

/// `"{0}".formatted(a)` becomes `String.format(locale, "{0}", a)`.
pub fn formatted(context: &Context, call: Node) -> Vec<Fix> {
    let given = arguments(call);
    let receiver = call.child_by_field_name("object").map(|object| context.text(object)).unwrap_or_default();
    each(context, call, &FORMATTING, |fix, text| replaced(call, format!("String.format({text}, {receiver}, {})", joined(context, &given)))(fix))
}

pub fn message_format(context: &Context, call: Node) -> Vec<Fix> {
    let given = arguments(call);
    let Some((pattern, rest)) = given.split_first() else { return Vec::new() };
    each(context, call, &FORMATTING, |mut fix, text| {
        let class = qualify_type(context, call, "java.text.MessageFormat", &mut fix);
        replaced(call, format!("new {class}({}, {text}).format({})", context.text(*pattern), joined(context, rest)))(fix)
    })
}

pub fn resource_bundle(context: &Context, call: Node) -> Vec<Fix> {
    let first = arguments(call).first().map(|first| first.end_byte());
    each(context, call, &PLAIN, |fix, text| first.map_or(fix.clone(), |end| fix.insert(end, format!(", {text}"))))
}

/// `DateFormat.getInstance()` and the factories that take a style.
pub fn date_format(context: &Context, call: Node, name: &str) -> Vec<Fix> {
    let given = arguments(call);
    let count = if name == "getDateTimeInstance" { 2 } else { 1 };
    let renamed = call.child_by_field_name("name");
    each(context, call, &FORMATTING, |mut fix, text| {
        if name == "getInstance" {
            let short = qualify_static_import(context, call, "java.text.DateFormat.SHORT", &mut fix);
            fix = fix.and(select_end(call), call.end_byte(), format!("({short}, {short}, {text})"));
            return match renamed {
                Some(written) => fix.and(written.start_byte(), written.end_byte(), "getDateTimeInstance"),
                None => fix,
            };
        }
        match given.last() {
            Some(last) => fix.insert(last.end_byte(), format!(", {text}")),
            None => {
                let default = qualify_static_import(context, call, "java.text.DateFormat.DEFAULT", &mut fix);
                let styles = vec![default; count].join(", ");
                fix.and(select_end(call), call.end_byte(), format!("({styles}, {text})"))
            }
        }
    })
}

pub fn decimal_format(context: &Context, call: Node) -> Vec<Fix> {
    let given = arguments(call);
    each(context, call, &FORMATTING, |fix, text| match given.last() {
        Some(last) => fix.insert(last.end_byte(), format!(", DecimalFormatSymbols.getInstance({text})")),
        None => replaced(call, format!("NumberFormat.getInstance({text})"))(fix),
    })
}

pub fn simple_date_format(context: &Context, call: Node) -> Vec<Fix> {
    let given = arguments(call);
    each(context, call, &FORMATTING, |mut fix, text| match given.last() {
        Some(last) => fix.insert(last.end_byte(), format!(", {text}")),
        None => {
            let short = qualify_static_import(context, call, "java.text.DateFormat.SHORT", &mut fix);
            replaced(call, format!("DateFormat.getDateTimeInstance({short}, {short}, {text})"))(fix)
        }
    })
}

/// A `Formatter` that writes to an `Appendable` takes the locale; the other one-argument forms get no fix.
pub fn formatter(context: &Context, call: Node) -> Vec<Fix> {
    let given = arguments(call);
    if given.len() == 1 {
        let index = context.resolver.index;
        let kind = context.resolver.type_of(given[0]);
        let under = |above: &str| kind.as_ref().is_some_and(|kind| matches!(kind, Type::Class(..)) && index.is_subtype(&kind.erased().name(), above));
        if !under("java.lang.Appendable") || under("java.io.PrintStream") {
            return Vec::new();
        }
    }
    appended(context, call, &FORMATTING)
}
