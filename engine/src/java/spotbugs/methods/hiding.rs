//! HSM_HIDING_METHOD: a static method with the name and erased descriptor of a static method that a superclass
//! makes visible, one finding for each superclass that declares one.
use super::super::classes::lines;
use super::super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const PATTERN: &str = "HSM_HIDING_METHOD";

/// The name SpotBugs prints for a class: its binary name without package and outer classes.
fn simple_name(binary: &str) -> &str {
    let short = names::short(binary);
    short.rsplit_once('$').map_or(short, |(_, inner)| inner)
}

fn is_main(name: &str, parameters: &[Type]) -> bool {
    name == "main" && matches!(parameters, [Type::Array(element)] if element.erased().name() == "java.lang.String")
}

pub fn check(context: &Context, class: Node) {
    if !context.wants(&[PATTERN]) || matches!(class.kind(), "interface_declaration" | "annotation_type_declaration") {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let index = context.resolver.index;
    let Some(info) = index.get(own) else { return };
    let supers: Vec<String> = index.superclasses(own).into_iter().skip(1).collect();
    let binary = names::binary(context, own);
    for method in place::members(body).into_iter().filter(|member| member.kind() == "method_declaration") {
        if !has_modifier(method, "static") || has_modifier(method, "private") {
            continue;
        }
        let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let (erased, _, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
        let Some(declared) = info.methods.iter().find(|known| known.name == name && known.is_static && known.parameters == erased) else { continue };
        if is_main(name, &erased) {
            continue;
        }
        let hidden: Vec<&String> = supers
            .iter()
            .filter(|holder| {
                index.get(holder).is_some_and(|holder| {
                    holder.methods.iter().any(|other| {
                        other.name == name && other.is_static && !other.is_private && other.parameters == declared.parameters && other.returns.erased() == declared.returns.erased()
                    })
                })
            })
            .collect();
        if hidden.is_empty() {
            continue;
        }
        let line = if has_modifier(method, "native") { Some(0) } else { lines::method_start(context, method) };
        let Some(line) = line else { continue };
        let label = names::method(context, own, method, None);
        let open = label.find('(').unwrap_or(label.len());
        let signature = &label[label[..open].rfind('.').map_or(0, |dot| dot + 1)..];
        let mine = simple_name(&binary);
        for holder in hidden {
            let theirs = names::binary(context, holder);
            let message = format!(
                "The method '{signature}' in class '{mine}' hides a method in class '{}'. Declare the respective methods non-static or private to eradicate the problem.",
                simple_name(&theirs)
            );
            let place = format!("{}@{theirs}", place::function(&label));
            context.report_listed(PATTERN, method, line, message, place, 2, vec![signature.to_string(), mine.to_string(), simple_name(&theirs).to_string()]);
        }
    }
}
