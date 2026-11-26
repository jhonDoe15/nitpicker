//! HSM_HIDING_METHOD: a static method with the name and erased descriptor of a static method that a superclass
//! makes visible, one finding for each superclass that declares one. SpotBugs gives up on the rest of the class at
//! a native method that hides one.
use super::super::classes::lines;
use super::super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::TYPE_DECLARATIONS;
use crate::java::types::model::{Method, Type};
use std::collections::HashMap;
use tree_sitter::Node;

const PATTERN: &str = "HSM_HIDING_METHOD";

/// The name SpotBugs prints for a class: its binary name without package and outer classes.
fn simple_name(binary: &str) -> &str {
    let short = names::short(binary);
    short.rsplit_once('$').filter(|(outer, _)| !outer.is_empty()).map_or(short, |(_, inner)| inner)
}

fn is_main(name: &str, parameters: &[Type]) -> bool {
    name == "main" && matches!(parameters, [Type::Array(element)] if element.erased().name() == "java.lang.String")
}

/// SpotBugs reports nothing for a class file with more methods than this.
const MOST_METHODS: usize = 1000;

/// About how many methods the class file holds: declared methods and constructors (one when none is declared), one
/// per lambda and a static initializer when the class needs one.
fn compiled_methods(body: Node) -> usize {
    let members = place::members(body);
    let methods = members.iter().filter(|member| member.kind() == "method_declaration").count();
    let constructors = members.iter().filter(|member| member.kind().ends_with("constructor_declaration")).count().max(1);
    let initialized = members.iter().any(|member| {
        member.kind() == "static_initializer" || (member.kind() == "field_declaration" && has_modifier(*member, "static") && declarators(*member).iter().any(|field| field.child_by_field_name("value").is_some()))
    });
    let mut lambdas = 0;
    let mut stack = children(body);
    while let Some(node) = stack.pop() {
        lambdas += usize::from(node.kind() == "lambda_expression");
        if node.kind() != "class_body" && !TYPE_DECLARATIONS.contains(&node.kind()) {
            stack.extend(children(node));
        }
    }
    methods + constructors + lambdas + usize::from(initialized)
}

pub fn check(context: &Context, class: Node) {
    if !context.wants(&[PATTERN]) || matches!(class.kind(), "interface_declaration" | "annotation_type_declaration") {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let statics: Vec<Node> = place::members(body)
        .into_iter()
        .filter(|member| member.kind() == "method_declaration" && has_modifier(*member, "static") && !has_modifier(*member, "private"))
        .collect();
    let index = context.resolver.index;
    let Some(info) = statics.first().and_then(|_| index.get(own)).filter(|_| compiled_methods(body) <= MOST_METHODS) else { return };
    let chain = index.superclasses(own);
    if chain.last().is_some_and(|last| last != "java.lang.Object" && index.get(last).is_none()) {
        return;
    }
    let mut visible: HashMap<&str, Vec<(&String, &Method)>> = HashMap::new();
    for holder in chain.iter().skip(1) {
        for other in index.get(holder).map(|holder| holder.methods.as_slice()).unwrap_or_default() {
            if other.is_static && !other.is_private {
                visible.entry(other.name.as_str()).or_default().push((holder, other));
            }
        }
    }
    let mut mine: HashMap<&str, Vec<&Method>> = HashMap::new();
    for known in info.methods.iter().filter(|known| known.is_static && visible.contains_key(known.name.as_str())) {
        mine.entry(known.name.as_str()).or_default().push(known);
    }
    let binary = names::binary(context, own);
    for method in statics {
        let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let (Some(candidates), Some(declared)) = (visible.get(name), mine.get(name)) else { continue };
        let (erased, _, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
        let Some(declared) = declared.iter().find(|known| known.parameters == erased) else { continue };
        if is_main(name, &erased) {
            continue;
        }
        let mut hidden: Vec<&String> = Vec::new();
        for (holder, other) in candidates {
            if other.parameters == declared.parameters && other.returns.erased() == declared.returns.erased() && !hidden.contains(holder) {
                hidden.push(holder);
            }
        }
        if hidden.is_empty() {
            continue;
        }
        if has_modifier(method, "native") {
            return;
        }
        let Some(line) = lines::method_start(context, method) else { continue };
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
