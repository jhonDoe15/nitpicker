//! A lambda or a method reference against the method of the functional interface it stands for: the same two
//! rules as for an overriding method. Follows NullAway's `checkOverriding` and `checkParamOverriding`.
use super::sites::{accepted, rows};
use super::*;
use crate::java::types::model::Method;

/// A type the way NullAway prints it in these messages: simple names, type arguments kept.
fn pretty(kind: &Type) -> String {
    match kind {
        Type::Primitive(name) => (*name).to_string(),
        Type::Class(name, arguments) => {
            let simple = name.rsplit('.').next().unwrap_or(name);
            if arguments.is_empty() { simple.to_string() } else { format!("{simple}<{}>", arguments.iter().map(pretty).collect::<Vec<_>>().join(", ")) }
        }
        Type::Array(element) => format!("{} []", pretty(element)),
        Type::Variable(name) => name.clone(),
        Type::Wildcard => "?".to_string(),
        Type::Bounded(lower, bound) => format!("? {} {}", if *lower { "super" } else { "extends" }, pretty(bound)),
        Type::Null => "null".to_string(),
    }
}

fn as_call(class: &ClassInfo, method: &Method) -> Call {
    Call { raw: false, receiver: Type::class(&class.name), declaring: class.name.clone(), method: method.clone() }
}

/// Whether a method may return null: its own mark where its class is checked, else `unchecked`; then the models.
fn returns_null(context: &Context, class: &ClassInfo, method: &Method, unchecked: bool) -> bool {
    let resolver = context.resolver;
    let loose = !annotated(context, &class.name);
    let call = as_call(class, method);
    let modelled = |table: &[models::Model]| table.iter().any(|row| fits(resolver, row, &call, false) || loose && resolver.index.is_subtype(&call.declaring, row.0) && fits(resolver, row, &call, true));
    if modelled(models::NONNULL_RETURNS) {
        return false;
    }
    if modelled(models::ALWAYS_NULLABLE_RETURNS) || modelled(models::NULLABLE_RETURNS_JSPECIFY_MODE_DISABLED) {
        return true;
    }
    if loose { unchecked } else { method.flags & flag::NULLABLE != 0 }
}

/// Whether the referenced method refuses null in a parameter: a library model decides first, then its own marks.
fn refuses(context: &Context, class: &ClassInfo, method: &Method, at: usize) -> bool {
    if rows(models::EXPLICITLY_NULLABLE_PARAMETERS, &class.name, method).contains(&at) {
        return false;
    }
    if rows(models::NON_NULL_PARAMETERS, &class.name, method).contains(&at) {
        return true;
    }
    annotated(context, &class.name) && (at >= 64 || method.nullable_parameters & (1 << at) == 0)
}

/// Whether the referenced method's `@Contract` promises a result that is not null for everything the interface
/// method passes: then a result marked nullable does no harm.
fn promised(above: &Method, own: &Method, unbound: bool) -> bool {
    let count = own.parameters.len();
    if own.contract.trim().is_empty() || own.varargs || above.varargs || unbound || above.parameters.len() != count {
        return false;
    }
    own.contract.trim().split(';').any(|clause| {
        let parts: Vec<&str> = clause.split("->").collect();
        let [given, result] = parts.as_slice() else { return false };
        let given: Vec<&str> = if given.trim().is_empty() { Vec::new() } else { given.split(',').map(str::trim).collect() };
        let passes = |(at, value): (usize, &&str)| *value == "_" || *value == "!null" && (at >= 64 || above.nullable_parameters & (1 << at) == 0);
        result.trim() == "!null" && given.len() == count && given.iter().enumerate().all(passes)
    })
}

fn lambda(context: &Context, node: Node, shown: &dyn Fn() -> String, accepts: u64) {
    let Some(list) = node.child_by_field_name("parameters").filter(|list| list.kind() == "formal_parameters") else { return };
    let written = children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"));
    for (at, formal) in written.enumerate().take(64) {
        let name = formal.child_by_field_name("name").or_else(|| children(formal).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")));
        let Some(name) = name else { continue };
        if accepts & (1 << at) != 0 && !crate::java::helpers::marked_nullable(context.file, formal) {
            let message = format!("parameter {} is @NonNull, but parameter in functional interface method {} is @Nullable", context.text(name), shown());
            context.report("NullAway", formal, name.start_byte(), &message);
            return;
        }
    }
}

fn reference(context: &Context, node: Node, shown: &dyn Fn() -> String, above: (&ClassInfo, &Method), taken: &[Type]) {
    let (declaring, method) = above;
    let Some((_, origin, own, shifted)) = context.resolver.reference_method(node, taken) else { return };
    let unbound = shifted && !own.is_static;
    let void = matches!(&method.returns, Type::Primitive(name) if *name == "void");
    let created = own.name == "<init>";
    if !void && !returns_null(context, declaring, method, true) && !created && returns_null(context, origin, own, false) && !promised(method, own, unbound) {
        context.report("NullAway", node, node.start_byte(), &format!("referenced method returns @Nullable, but functional interface method {} returns @NonNull", shown()));
        return;
    }
    let accepts = accepted(context, &declaring.name, method);
    if unbound && accepts & 1 != 0 {
        let message = format!("unbound instance method reference cannot be used, as first parameter of functional interface method {} is @Nullable", shown());
        context.report("NullAway", node, node.start_byte(), &message);
        return;
    }
    let start = usize::from(unbound);
    let Some(last) = own.parameters.len().checked_sub(1) else { return };
    for at in (start..method.parameters.len().min(64)).filter(|at| accepts & (1 << at) != 0) {
        let position = (at - start).min(last);
        if refuses(context, origin, own, position) {
            let name = own.names.get(position).cloned().unwrap_or_else(|| format!("arg{position}"));
            let message = format!("parameter {name} of referenced method is @NonNull, but parameter in functional interface method {} is @Nullable", shown());
            context.report("NullAway", node, node.start_byte(), &message);
            return;
        }
    }
}

/// The functional interface method with the type arguments of this use filled in, the way NullAway prints it.
/// Asked for only when a report is made: it resolves the surrounding call again with its type variables kept.
fn shown(context: &Context, node: Node, declaring: &ClassInfo, method: &Method) -> String {
    let resolver = context.resolver.printing();
    let target = resolver.lambda_target(node).filter(|target| target.name() == declaring.name || resolver.index.is_subtype(&target.name(), &declaring.name));
    let map = target.map(|target| resolver.index.member_map(&target, &declaring.name)).unwrap_or_default();
    let taken = method.generic_parameters.iter().map(|kind| pretty(&kind.substitute(&map)));
    format!("{}.{}({})", declaring.name, method.name, taken.collect::<Vec<_>>().join(","))
}

pub(super) fn standing_in(context: &Context, node: Node) {
    let resolver = context.resolver;
    let Some(target) = resolver.lambda_target(node) else { return };
    let Some((declaring, method)) = resolver.index.functional_method(&target.name()) else { return };
    let shown = || shown(context, node, declaring, method);
    if node.kind() == "method_reference" {
        let map = resolver.index.member_map(&target, &declaring.name);
        let taken: Vec<Type> = method.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect();
        reference(context, node, &shown, (declaring, method), &taken);
    } else if annotated(context, &declaring.name) {
        lambda(context, node, &shown, accepted(context, &declaring.name, method));
    }
}
