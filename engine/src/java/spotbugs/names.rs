//! Names as SpotBugs prints them: binary class names, methods with the simple names of their erased parameters.
use super::Context;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// `pkg.Outer$Inner` for the index's `pkg.Outer.Inner`.
pub fn binary(context: &Context, class: &str) -> String {
    crate::java::javac::binary(context.resolver.index, class)
}

pub fn package_of(binary: &str) -> &str {
    binary.rsplit_once('.').map_or("", |(package, _)| package)
}

/// The binary name without its package.
pub fn short(binary: &str) -> &str {
    binary.rsplit_once('.').map_or(binary, |(_, simple)| simple)
}

/// An erased type the way a method signature shows it.
pub fn simple(context: &Context, kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", simple(context, element)),
        Type::Class(name, _) => short(&binary(context, name.split('&').next().unwrap_or(name))).to_string(),
        other => other.erased().name().rsplit('.').next().unwrap_or_default().to_string(),
    }
}

/// `pkg.Class.method(A, B)`, or `new pkg.Class(A, B)` for a constructor. An inner class takes its outer instance first.
pub fn method(context: &Context, class: &str, declaration: Node, outer: Option<&str>) -> String {
    let (erased, _, _) = context.resolver.parameters(declaration.child_by_field_name("parameters"));
    let mut shown: Vec<String> = outer.map(|outer| short(&binary(context, outer)).to_string()).into_iter().collect();
    shown.extend(erased.iter().map(|kind| simple(context, kind)));
    let owner = binary(context, class);
    if TYPE_DECLARATIONS.contains(&declaration.kind()) || declaration.kind().ends_with("constructor_declaration") {
        let holder = if TYPE_DECLARATIONS.contains(&declaration.kind()) { Some(declaration) } else { crate::engine::source::ancestor(declaration, TYPE_DECLARATIONS) };
        let local = holder.filter(|holder| crate::java::javac::declared_locally(*holder));
        shown.extend(local.map(|local| context.compiled().local_class_extras(context.resolver, local)).unwrap_or_default().iter().map(|kind| shown_type(context, kind)));
        return format!("new {owner}({})", shown.join(", "));
    }
    let name = declaration.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    format!("{owner}.{name}({})", shown.join(", "))
}

fn shown_type(context: &Context, kind: &Option<Type>) -> String {
    kind.as_ref().map_or_else(|| "?".to_string(), |kind| simple(context, kind))
}

/// `new pkg.Outer$1(Outer, A)`: the constructor the compiler writes for an anonymous class.
pub fn anonymous(context: &Context, class: &str, creation: Node) -> String {
    let shown: Vec<String> = context.compiled().anonymous_constructor(context.resolver, creation).iter().map(|kind| shown_type(context, kind)).collect();
    format!("new {}({})", binary(context, class), shown.join(", "))
}

/// `pkg.Outer.lambda$method$0(A, B)`: the hidden method that holds the body of a lambda. Not known for a
/// serializable lambda.
#[allow(dead_code)]
pub fn lambda(context: &Context, lambda: Node) -> Option<String> {
    let compiled = context.compiled();
    let synthetic = compiled.lambda(lambda)?;
    let shown: Vec<String> = compiled.lambda_parameters(context.resolver, lambda).iter().map(|kind| shown_type(context, kind)).collect();
    Some(format!("{}.{}({})", binary(context, &synthetic.owner), synthetic.name.as_ref()?, shown.join(", ")))
}

/// The method SpotBugs names for code at `node`: the lambda around it, else the method or constructor, else
/// the constructor of the anonymous class whose initializers hold it. For patterns that report inside method bodies.
#[allow(dead_code)]
pub fn around(context: &Context, node: Node) -> Option<String> {
    const BODIES: &[&str] = &["lambda_expression", "method_declaration", "constructor_declaration", "compact_constructor_declaration", "class_body"];
    let body = crate::engine::source::ancestor(node, BODIES)?;
    let scope = context.resolver.scope;
    match body.kind() {
        "lambda_expression" => lambda(context, body),
        "class_body" => {
            let creation = crate::engine::source::parent(body).filter(|holder| holder.kind() == "object_creation_expression")?;
            Some(anonymous(context, scope.names.get(&creation.id())?, creation))
        }
        _ => {
            let nest = crate::java::types::scope::enclosing_types(scope, body);
            let holder = crate::engine::source::ancestor(body, TYPE_DECLARATIONS);
            let outer = if body.kind() == "constructor_declaration" { holder.and_then(|holder| crate::java::javac::instance_around(context.resolver, holder)) } else { None };
            Some(method(context, nest.first()?, body, outer.as_deref()))
        }
    }
}

/// A field as a message names it from inside `from`: without the package when both are in the same one.
pub fn field(context: &Context, from: &str, declaring: &str, name: &str) -> String {
    let (from, declaring) = (binary(context, from), binary(context, declaring));
    if package_of(&from) == package_of(&declaring) {
        format!("{}.{name}", short(&declaring))
    } else {
        format!("{declaring}.{name}")
    }
}

/// The hidden field an inner class keeps its outer instance in: `this$0` when the outer class is a top-level or
/// static one, one more for every inner class the outer class itself sits in. `nest` is the class and the
/// classes around it.
pub fn outer_field(context: &Context, nest: &[String]) -> String {
    let inner = |name: &&String| {
        context.classes.get(*name).is_some_and(|class| {
            class.kind() == "class_declaration"
                && !crate::java::helpers::has_modifier(*class, "static")
                && crate::engine::source::parent(*class).is_some_and(|holder| holder.kind() == "class_body")
        })
    };
    format!("this${}", nest.iter().skip(1).take_while(inner).count())
}
