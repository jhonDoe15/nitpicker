//! What Lombok wrote into the run's classes, read from the build's class files (see `types::compiled`): Error Prone
//! sees those members in the trees it checks.
use super::Context;
use crate::java::types::compiled::{CompiledClass, CompiledMethod};

/// The class file of a source class, for Lombok runs that get the build's class directories.
pub fn class<'c>(context: &'c Context, class: &str) -> Option<&'c CompiledClass> {
    if context.project.compiled.is_empty() {
        return None;
    }
    context.project.compiled.get(&crate::java::javac::binary(context.resolver.index, class))
}

/// The member classes Lombok wrote into a class, such as builders, and theirs.
pub fn written_classes<'c>(context: &'c Context, compiled: &'c CompiledClass) -> Vec<&'c CompiledClass> {
    let mut found = Vec::new();
    let mut pending: Vec<&CompiledClass> = vec![compiled];
    while let Some(next) = pending.pop() {
        for member in next.members.iter().filter_map(|name| context.project.compiled.get(name)).filter(|member| member.generated) {
            found.push(member);
            pending.push(member);
        }
    }
    found
}

/// The methods Lombok wrote into a class and into the member classes it wrote there.
pub fn written_methods<'c>(context: &'c Context, compiled: &'c CompiledClass) -> Vec<&'c CompiledMethod> {
    let written = compiled.methods.iter().filter(|method| method.generated);
    let nested = written_classes(context, compiled).into_iter().flat_map(|class| class.methods.iter().filter(|method| method.generated || class.generated));
    written.chain(nested).collect()
}

/// For each member Lombok wrote into a class declaration (fields, methods, constructors, member classes): whether
/// it is static. Empty without the class file.
pub fn written_members(context: &Context, declaration: tree_sitter::Node) -> Vec<bool> {
    use crate::java::types::compiled::ACC_STATIC;
    let Some(compiled) = context.resolver.scope.names.get(&declaration.id()).and_then(|name| class(context, name)) else { return Vec::new() };
    let fields = compiled.fields.iter().filter(|field| field.generated).map(|field| field.access & ACC_STATIC != 0);
    let methods = compiled.methods.iter().filter(|method| method.generated).map(|method| method.name != "<init>" && method.access & ACC_STATIC != 0);
    let members = compiled.members.iter().filter_map(|name| context.project.compiled.get(name)).filter(|member| member.generated);
    let classes = members.map(|member| member.nested.is_some_and(|access| access & ACC_STATIC != 0));
    fields.chain(methods).chain(classes).collect()
}

/// Whether the class file makes a member class static: `@UtilityClass` does.
pub fn static_class(context: &Context, declaration: tree_sitter::Node) -> bool {
    use crate::java::types::compiled::ACC_STATIC;
    let compiled = context.resolver.scope.names.get(&declaration.id()).and_then(|name| class(context, name));
    compiled.and_then(|compiled| compiled.nested).is_some_and(|access| access & ACC_STATIC != 0)
}

/// Whether code Lombok wrote into a member class at any depth inside the class names `this`: Lombok spells out
/// `this.` for every field it reads or writes, and `this` there belongs to that member class. A constructor Lombok
/// wrote names it when it takes parameters (`this.field = field`); field initializers javac copies into it do not.
pub fn this_in_members(context: &Context, compiled: &CompiledClass) -> bool {
    use crate::java::types::compiled::ACC_STATIC;
    let mut pending: Vec<&CompiledClass> = compiled.members.iter().filter_map(|name| context.project.compiled.get(name)).collect();
    while let Some(next) = pending.pop() {
        let outer = usize::from(next.nested.is_some_and(|access| access & ACC_STATIC == 0));
        let names_this = |method: &CompiledMethod| {
            let parameters = crate::java::types::compiled::shown_parameters(&method.descriptor).len();
            let uses = if method.name == "<init>" { parameters > outer } else { method.loads_this };
            (method.generated || next.generated) && method.access & ACC_STATIC == 0 && uses
        };
        if next.methods.iter().any(names_this) {
            return true;
        }
        pending.extend(next.members.iter().filter_map(|name| context.project.compiled.get(name)));
    }
    false
}

/// Whether the class file makes a field or method of the class static, as `@UtilityClass` does. A method is matched
/// by name and parameter count and counts only when every such method agrees.
pub fn static_member(context: &Context, compiled: Option<&CompiledClass>, member: tree_sitter::Node) -> bool {
    use crate::java::types::compiled::ACC_STATIC;
    let Some(compiled) = compiled else { return false };
    match member.kind() {
        "class_declaration" => static_class(context, member),
        "field_declaration" => {
            let names = crate::java::helpers::declarators(member).into_iter().filter_map(|declarator| declarator.child_by_field_name("name"));
            let fields: Vec<bool> = names.map(|name| compiled.field(context.text(name)).is_some_and(|field| field.access & ACC_STATIC != 0)).collect();
            !fields.is_empty() && fields.iter().all(|is_static| *is_static)
        }
        "method_declaration" => {
            let Some(name) = member.child_by_field_name("name").map(|name| context.text(name)) else { return false };
            let count = member.child_by_field_name("parameters").map_or(0, |list| {
                crate::engine::source::named_children(list).iter().filter(|part| part.kind().ends_with("parameter")).count()
            });
            let same = |method: &&CompiledMethod| method.name == name && crate::java::types::compiled::shown_parameters(&method.descriptor).len() == count;
            let matching: Vec<&CompiledMethod> = compiled.methods.iter().filter(same).collect();
            !matching.is_empty() && matching.iter().all(|method| method.access & ACC_STATIC != 0)
        }
        _ => false,
    }
}
