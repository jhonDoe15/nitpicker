//! Whole SpotBugs detectors that look at the code of each method on its own: IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD
//! (ConfusionBetweenInheritedAndOuterMethod), IT_NO_SUCH_ELEMENT (IteratorIdioms), DM_DEFAULT_ENCODING
//! (DefaultEncodingDetector) and UCF_USELESS_CONTROL_FLOW with UCF_USELESS_CONTROL_FLOW_NEXT_LINE (FindUselessControlFlow).
mod control;
mod encoding;
mod iterators;
mod outer;
mod outer_this;

use super::statements::{member_label, own_nodes};
use super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// One method of the class file: a declared method or constructor, the static initializer, or the body of a lambda.
pub struct Compiled<'a> {
    pub label: String,
    /// The declaration, the class for the constructor javac writes, or the lambda.
    pub member: Node<'a>,
    /// The nodes of its code in source order, without classes declared inside and lambdas.
    pub nodes: Vec<Node<'a>>,
    pub lambda: bool,
}

fn body_of(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

fn initializes(member: Node, interface: bool, wanted_static: bool) -> bool {
    match member.kind() {
        "field_declaration" => (has_modifier(member, "static") || interface) == wanted_static,
        "constant_declaration" | "enum_constant" => wanted_static,
        "static_initializer" => wanted_static,
        "block" => !wanted_static,
        _ => false,
    }
}

fn delegates(constructor: Node) -> bool {
    super::classes::lines::delegates(constructor)
}

/// The methods javac writes for a class, with the code each one holds. Field initializers and initializer blocks
/// go into every constructor that does not start with `this(...)`, or the one javac writes when none is declared.
pub fn compiled<'a>(context: &Context<'a>, own: &str, class: Node<'a>) -> Vec<Compiled<'a>> {
    let Some(body) = body_of(class) else { return Vec::new() };
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    let members = place::members(body);
    let mut lambdas = Vec::new();
    let collect = |parts: &[Node<'a>], lambdas: &mut Vec<Node<'a>>| {
        let mut nodes = Vec::new();
        for part in parts {
            own_nodes(*part, &mut nodes, lambdas);
        }
        nodes
    };
    let instance: Vec<Node> = members.iter().copied().filter(|member| initializes(*member, interface, false)).collect();
    let statics: Vec<Node> = members.iter().copied().filter(|member| initializes(*member, interface, true)).collect();
    let mut out = Vec::new();
    let mut constructors = 0;
    for member in &members {
        let label = match member.kind() {
            "method_declaration" => member_label(context, own, class, *member),
            "constructor_declaration" | "compact_constructor_declaration" => {
                constructors += 1;
                member_label(context, own, class, *member)
            }
            _ => continue,
        };
        let mut parts = Vec::new();
        if member.kind().ends_with("constructor_declaration") && !delegates(*member) {
            parts.extend(instance.iter().copied());
        }
        let mut nodes = collect(&parts, &mut lambdas);
        own_nodes(*member, &mut nodes, &mut lambdas);
        if let Some(label) = label {
            out.push(Compiled { label, member: *member, nodes, lambda: false });
        }
    }
    if constructors == 0 && !interface && !instance.is_empty() {
        let label = if class.kind() == "object_creation_expression" { Some(names::anonymous(context, own, class)) } else { member_label(context, own, class, class) };
        let nodes = collect(&instance, &mut lambdas);
        if let Some(label) = label {
            out.push(Compiled { label, member: class, nodes, lambda: false });
        }
    }
    if !statics.is_empty() {
        let binary = names::binary(context, own);
        let simple = binary.rsplit(['.', '$']).next().unwrap_or(&binary).to_string();
        let nodes = collect(&statics, &mut lambdas);
        out.push(Compiled { label: format!("{binary}.<static initializer for {simple}>()"), member: class, nodes, lambda: false });
    }
    while let Some(lambda) = lambdas.pop() {
        let mut nodes = Vec::new();
        own_nodes(lambda, &mut nodes, &mut lambdas);
        if let Some(label) = names::lambda(context, lambda) {
            out.push(Compiled { label, member: lambda, nodes, lambda: true });
        }
    }
    out
}

/// A method as SpotBugs prints one it calls: the class without the package when it is `java.lang`, then the
/// simple names of the erased parameters.
pub fn called(context: &Context, class: &str, name: &str, parameters: &[crate::java::types::model::Type]) -> String {
    let binary = names::binary(context, class);
    let shown = binary.strip_prefix("java.lang.").filter(|rest| !rest.contains('.')).unwrap_or(&binary);
    let listed: Vec<String> = parameters.iter().map(|kind| names::simple(context, kind)).collect();
    if name == "<init>" {
        return format!("new {shown}({})", listed.join(", "));
    }
    format!("{shown}.{name}({})", listed.join(", "))
}

pub fn idioms<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(&[outer::PATTERN, iterators::PATTERN, encoding::PATTERN, control::USELESS, control::NEXT_LINE]) {
        return;
    }
    if !(TYPE_DECLARATIONS.contains(&class.kind()) || body_of(class).is_some()) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let methods = compiled(context, &own, class);
    outer::check(context, &own, class, &methods);
    iterators::check(context, &own, class, &methods);
    encoding::check(context, &own, &methods);
    control::check(context, &methods);
}
