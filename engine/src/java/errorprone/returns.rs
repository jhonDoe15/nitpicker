//! CheckReturnValue: a call, constructor call or method reference drops a result that must be used.
use super::Context;
use super::fixes::Fix;
use super::ignored_fix::{call_site_fixes, declaration_fix};
use super::hierarchy::{sub_signature, super_methods};
use super::unused::{dropped, exception_testing, function_returns_void, mocking, statements, throwing_type};
use crate::engine::source::children;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Method, Type, flag};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const NAME: &str = "CheckReturnValue";
const VOID: Type = Type::Primitive("void");
const PROTO_OWNERS: [&str; 2] = ["com.google.protobuf.MessageLite.Builder", "com.google.protobuf.MutableMessageLite"];
const PROTO_MUTATORS: [&str; 7] = ["add", "clear", "insert", "merge", "remove", "set", "put"];

fn proto_rule(index: &TypeIndex, declaring: &ClassInfo, method: &Method) -> bool {
    PROTO_OWNERS.iter().any(|owner| {
        let name = method.name.as_str();
        let accessor = name.starts_with("get") && ((name.ends_with("Builder") && !name.ends_with("OrBuilder")) || name.starts_with("getMutable"));
        index.is_subtype(&declaring.name, owner)
            && (PROTO_MUTATORS.iter().any(|start| name.starts_with(start)) || (accessor && index.is_subtype(&method.returns.name(), owner)))
    })
}

/// What the method itself says: `Some(true)` when its result must be used, `Some(false)` when it may be dropped.
fn method_rules(index: &TypeIndex, declaring: &ClassInfo, method: &Method) -> Option<bool> {
    if method.flags & flag::CHECK_RESULT != 0 {
        return Some(true);
    }
    let mut chain = vec![(declaring, method)];
    chain.extend(super_methods(index, declaring, method));
    if chain.iter().any(|(_, each)| each.flags & flag::IGNORE_RESULT != 0) || proto_rule(index, declaring, method) {
        return Some(false);
    }
    let generated = |bit: u32| chain.iter().find(|(class, each)| each.is_abstract && class.flags & bit != 0);
    if generated(flag::AUTO_VALUE).is_some() {
        return Some(true);
    }
    if let Some((class, each)) = generated(flag::AUTO_BUILDER) {
        return Some(!(each.parameters.len() == 1 && each.returns.name() == class.name));
    }
    let fluent = method.parameters.len() == 1 && method.is_abstract && method.returns.name() == declaring.name;
    (fluent && declaring.flags & flag::DAGGER_BUILDER != 0).then_some(false)
}

/// Whether the result of the method must be used: the method decides first, then the classes around it from the
/// inside out, then its packages from the inside out.
fn expected(index: &TypeIndex, declaring: &ClassInfo, method: &Method) -> bool {
    if let Some(decided) = method_rules(index, declaring, method) {
        return decided;
    }
    let marked = |flags: u32| match flags & (flag::CHECK_RESULT | flag::IGNORE_RESULT) {
        0 => None,
        bits => Some(bits & flag::CHECK_RESULT != 0),
    };
    let mut class = declaring.name.as_str();
    while class.len() > declaring.package.len() {
        if let Some(decided) = index.get(class).and_then(|info| marked(info.flags)) {
            return decided;
        }
        class = class.rsplit_once('.').map_or("", |(outer, _)| outer);
    }
    let mut package = declaring.package.as_str();
    while !package.is_empty() {
        if let Some(decided) = index.get(&format!("{package}.package-info")).and_then(|info| marked(info.flags)) {
            return decided;
        }
        let mut listed = Some(package);
        while let Some(name) = listed {
            if index.checked_packages.iter().any(|checked| checked == name) {
                return true;
            }
            listed = name.rsplit_once('.').map(|(outer, _)| outer);
        }
        package = package.rsplit_once('.').map_or("", |(outer, _)| outer);
    }
    false
}

fn report(context: &Context, node: Node, at: usize, short: &str, fixes: &[Fix]) {
    context.report_fixed(NAME, node, at, &format!("The result of `{short}` must be used"), fixes);
}

fn parens(empty: bool) -> &'static str {
    if empty { "()" } else { "(...)" }
}

fn call(context: &Context, node: Node) {
    let Some(place) = dropped(node) else { return };
    let Some((resolved, _)) = context.resolver.call_formals(node) else { return };
    let method = &resolved.method;
    let constructor = method.name == "<init>";
    if (!constructor && method.returns == VOID) || (place.id() != node.id() && function_returns_void(context, place) != Some(true)) {
        return;
    }
    let index = context.resolver.index;
    let Some(declaring) = index.get(&resolved.declaring) else { return };
    if constructor && declaring.is_interface {
        return;
    }
    let boxed_void = |kind: &Type| kind.name() == "java.lang.Void";
    let nothing = !constructor && (boxed_void(&method.returns) || (method.generic_returns.mentions_variable() && context.resolver.type_of(node).is_some_and(|kind| boxed_void(&kind))));
    if nothing || !expected(index, declaring, method) || mocking(context, node) || exception_testing(context, node) {
        return;
    }
    let empty = node.child_by_field_name("arguments").is_none_or(|list| statements(list).is_empty());
    if constructor {
        let start = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |word| word.start_byte());
        let created = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
        let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
        let mut fixes = if anonymous { vec![Fix::new()] } else { vec![declaration_fix(context, &resolved.declaring, method)] };
        fixes.extend(call_site_fixes(context, node));
        report(context, node, start, &format!("new {created}{}", parens(empty)), &fixes);
    } else {
        let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
        let mut fixes = vec![declaration_fix(context, &resolved.declaring, method)];
        fixes.extend(call_site_fixes(context, node));
        report(context, node, at, &format!("{}{}", method.name, parens(empty)), &fixes);
    }
}

/// The methods a method reference can stand for when the function it implements takes `arity` arguments.
pub fn referenced<'c>(context: &'c Context, qualifier: Node, name: &str, arity: usize) -> Vec<(&'c ClassInfo, &'c Method)> {
    use crate::java::types::expr::Receiver;
    let resolver = context.resolver;
    let index = resolver.index;
    let takes = |method: &Method, count: usize| method.parameters.len() == count || (method.varargs && method.parameters.len() <= count + 1);
    if name == "<init>" {
        let class = match resolver.receiver(qualifier) {
            Some(Receiver::Static(class)) => Some(class),
            _ => resolver.type_node(qualifier).filter(|kind| matches!(kind, Type::Class(..))).map(|kind| kind.name()),
        };
        let Some(info) = class.and_then(|class| index.get(&class)) else { return Vec::new() };
        return info.methods.iter().filter(|method| method.name == name && takes(method, arity)).map(|method| (info, method)).collect();
    }
    let receiver = match qualifier.kind() {
        "super" => enclosing_type(context.file, resolver.scope, qualifier)
            .and_then(|own| index.get(&own)?.superclass.clone())
            .map(|above| Receiver::Value(Type::class(&above))),
        "generic_type" | "scoped_type_identifier" | "type_identifier" => resolver.type_node(qualifier).map(|kind| Receiver::Static(kind.name())),
        _ => resolver.receiver(qualifier).or_else(|| resolver.type_node(qualifier).map(|kind| Receiver::Static(kind.erased().name()))),
    };
    match receiver {
        Some(Receiver::Value(Type::Class(class, _))) => index.methods(&class, name).into_iter().filter(|(_, method)| !method.is_static && takes(method, arity)).collect(),
        Some(Receiver::Static(class)) => index
            .methods(&class, name)
            .into_iter()
            .filter(|(_, method)| if method.is_static { takes(method, arity) } else { arity > 0 && takes(method, arity - 1) })
            .collect(),
        _ => Vec::new(),
    }
}

fn reference(context: &Context, node: Node) {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
    let index = context.resolver.index;
    let Some(target) = context.resolver.type_of(node) else { return };
    let Some((_, function)) = index.functional_method(&target.name()) else { return };
    if function.returns != VOID || throwing_type(context, &target.name()) {
        return;
    }
    let constructor = last.kind() == "new";
    let name = if constructor { "<init>" } else { context.text(last) };
    let mut candidates = referenced(context, qualifier, name, function.parameters.len());
    let all = candidates.clone();
    candidates.retain(|(above, other)| {
        !all.iter().any(|(class, method)| class.name != above.name && index.is_subtype(&class.name, &above.name) && sub_signature(index, class, method, above, other))
    });
    if candidates.iter().any(|(_, method)| !method.varargs) {
        candidates.retain(|(_, method)| !method.varargs);
    }
    let verdict = |(class, method): &(&ClassInfo, &Method)| {
        let nothing = !constructor && (method.returns == VOID || method.returns.name() == "java.lang.Void");
        (!nothing && expected(index, class, method), method.parameters.is_empty())
    };
    let Some(first) = candidates.first().map(verdict) else { return };
    if !first.0 || candidates.iter().any(|candidate| verdict(candidate) != first) {
        return;
    }
    if !constructor && candidates.iter().any(|(_, method)| method.generic_returns.mentions_variable()) {
        let owner = context.resolver.type_of(qualifier);
        let void = owner.is_some_and(|owner| {
            candidates.iter().all(|(class, method)| method.generic_returns.substitute(&index.member_map(&owner, &class.name)).name() == "java.lang.Void")
        });
        if void {
            return;
        }
    }
    let short = if constructor { format!("new {}", context.text(qualifier)) } else { name.to_string() };
    let fixes: Vec<Fix> = candidates.first().map(|(class, method)| declaration_fix(context, &class.name, method)).into_iter().collect();
    report(context, node, node.start_byte(), &format!("{short}{}", parens(first.1)), &fixes);
}

/// Both annotations on one declaration, or one of them on a method that gives nothing back.
fn declaration(context: &Context, node: Node) {
    let method = matches!(node.kind(), "method_declaration" | "constructor_declaration");
    let names = super::hierarchy::annotation_names(context, node);
    let present: Vec<&str> =
        ["CheckReturnValue", "CanIgnoreReturnValue"].into_iter().filter(|wanted| names.iter().any(|name| name.rsplit('.').next() == Some(*wanted))).collect();
    let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
    let at = match node.child_by_field_name("name") {
        Some(name) if method => name.start_byte(),
        _ => keyword.map_or(node.start_byte(), |word| word.start_byte() + usize::from(word.kind() == "@interface")),
    };
    if present.len() == 2 {
        let what = if method { "method" } else { "class" };
        context.report(NAME, node, at, &format!("@{} and @{} cannot be applied to the same {what}", present[0], present[1]));
    } else if present.len() == 1 && node.kind() == "method_declaration" && node.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type") {
        context.report(NAME, node, at, &format!("@{} may not be applied to void-returning methods", present[0]));
    }
}

pub fn check_return_value(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" | "object_creation_expression" => call(context, node),
        "method_reference" => reference(context, node),
        "method_declaration" | "constructor_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration"
        | "annotation_type_declaration" => declaration(context, node),
        _ => {}
    }
}
