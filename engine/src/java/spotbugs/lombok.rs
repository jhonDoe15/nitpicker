//! What Lombok changes in the compiled form of hand-written code. SpotBugs skips the members Lombok writes, which carry
//! `@lombok.Generated`, so only Lombok's changes to members that are in the source matter.
use super::Context;
use crate::engine::source::children;
use crate::java::helpers::annotation_names;
use crate::java::types::compiled::{CompiledClass, CompiledMethod, shown_parameters};
use tree_sitter::Node;

/// Annotations on a class that make Lombok write its constructors.
const CONSTRUCTORS: &[&str] = &["AllArgsConstructor", "NoArgsConstructor", "RequiredArgsConstructor", "Data", "Value", "Builder", "SuperBuilder"];

fn imports(context: &Context) -> Vec<String> {
    let root = context.file.tree.root_node();
    children(root).into_iter().filter(|part| part.kind() == "import_declaration").filter_map(|import| {
        let text = context.text(import).trim().trim_start_matches("import").trim_end_matches(';').trim();
        (!text.starts_with("static ")).then(|| text.chars().filter(|letter| !letter.is_whitespace()).collect())
    }).collect()
}

fn imported(context: &Context, name: &str) -> bool {
    let imports = imports(context);
    let lombok = [format!("lombok.{name}"), format!("lombok.experimental.{name}")];
    let single = imports.iter().find(|path| path.rsplit('.').next() == Some(name));
    match single {
        Some(path) => lombok.contains(path),
        None => imports.iter().any(|path| path == "lombok.*" || path == "lombok.experimental.*"),
    }
}

/// Whether `declaration` carries Lombok's annotation `name`, written `@name` with the import or `@lombok.name`.
pub fn annotated(context: &Context, declaration: Node, name: &str) -> bool {
    annotation_names(context.file, declaration).into_iter().any(|written| {
        written == format!("lombok.{name}") || written == format!("lombok.experimental.{name}") || (written == name && imported(context, name))
    })
}

/// A class without a hand-written constructor whose constructors Lombok writes: no constructor of it is analysed.
pub fn writes_constructors(context: &Context, class: Node) -> bool {
    CONSTRUCTORS.iter().any(|name| annotated(context, class, name))
}

/// The first parameter whose Lombok `@NonNull` makes the constructor start with a null check that throws.
pub fn checked_parameter<'t>(context: &Context, constructor: Node<'t>) -> Option<Node<'t>> {
    let parameters = constructor.child_by_field_name("parameters")?;
    children(parameters).into_iter().find(|parameter| matches!(parameter.kind(), "formal_parameter" | "spread_parameter") && annotated(context, *parameter, "NonNull"))
}

/// Annotations on a class that make Lombok write methods reading each of its fields.
const READERS: &[&str] = &["Data", "Value", "Getter", "ToString", "EqualsAndHashCode"];

/// Whether a method Lombok writes reads the field a declaration declares: a getter, `toString`, `equals` or
/// `hashCode` of its class, or the field's own `@Getter` that is not `AccessLevel.NONE`.
pub fn reads_field(context: &Context, declaration: Node) -> bool {
    let modifiers = crate::java::helpers::modifiers(declaration).map_or("", |modifiers| context.text(modifiers));
    let getter = annotated(context, declaration, "Getter") && !modifiers.contains("AccessLevel.NONE");
    let class = declaration.parent().and_then(|body| body.parent());
    let shown = |class: Node| crate::java::helpers::modifiers(class).is_none_or(|modifiers| !context.text(modifiers).contains("AccessLevel.NONE"));
    let reads = |class: Node, name: &&str| annotated(context, class, name) && (*name != "Getter" || shown(class));
    getter || class.is_some_and(|class| READERS.iter().any(|name| reads(class, name)))
}

/// The class file of a class of the run, read for Lombok runs that get the build's class directories.
pub fn compiled<'c>(context: &'c Context, class: &str) -> Option<&'c CompiledClass> {
    if context.project.compiled.is_empty() {
        return None;
    }
    context.project.compiled.get(&super::names::binary(context, class))
}

/// The methods Lombok wrote into a class, in class-file order.
pub fn written<'c>(context: &'c Context, class: &str) -> impl Iterator<Item = &'c CompiledMethod> {
    compiled(context, class).into_iter().flat_map(|class| class.methods.iter().filter(|method| method.generated))
}

/// `pkg.Class.method(A, B)` or `new pkg.Class(A, B)` for a method Lombok wrote.
pub fn label(context: &Context, class: &str, method: &CompiledMethod) -> String {
    let owner = super::names::binary(context, class);
    let shown = shown_parameters(&method.descriptor).join(", ");
    if method.name == "<init>" { format!("new {owner}({shown})") } else { format!("{owner}.{}({shown})", method.name) }
}
