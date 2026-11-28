//! Private methods that nothing in their file calls or references.
use crate::java::pmd::coded::constants::{Const, const_value};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::pmd::coded::message::{receiver, signature};
use crate::java::types::model::{Method, Type};
use std::collections::HashSet;

const SERIALIZATION: &[&str] = &["readObject", "readObjectNoData", "writeObject", "readResolve", "writeReplace"];
const IGNORED: &[&str] = &[
    "java.lang.Deprecated",
    "jakarta.annotation.PostConstruct",
    "jakarta.annotation.PreDestroy",
    "lombok.EqualsAndHashCode.Include",
];

fn flat_values(ctx: &Ctx, annotation: u32) -> Vec<u32> {
    let Some(list) = ctx.kid(annotation, "AnnotationMemberList") else { return Vec::new() };
    let mut values = Vec::new();
    for pair in ctx.kids_named(list, "MemberValuePair") {
        for value in ctx.kids(pair).iter().copied() {
            if ctx.is(value, "MemberValueArrayInitializer") {
                values.extend(ctx.kids(value).iter().copied());
            } else {
                values.push(value);
            }
        }
    }
    values
}

fn value_named(ctx: &Ctx, annotation: u32, name: &str) -> bool {
    let Some(list) = ctx.kid(annotation, "AnnotationMemberList") else { return false };
    ctx.kids_named(list, "MemberValuePair").any(|pair| ctx.text(pair, "Name") == name)
}

fn used_by_annotations(ctx: &Ctx) -> HashSet<String> {
    let mut names = HashSet::new();
    for &annotation in ctx.all("Annotation") {
        for value in flat_values(ctx, annotation) {
            if let Ok(Some(Const::Text(text))) = const_value(ctx, value)
                && !text.is_empty()
            {
                names.insert(text);
            }
        }
        if ctx.type_is(annotation, "org.junit.jupiter.params.provider.MethodSource")
            && !value_named(ctx, annotation, "value")
            && let Some(method) = ctx.ancestors(annotation).find(|at| ctx.is(*at, "MethodDeclaration"))
        {
            names.insert(ctx.text(method, "Name"));
        }
    }
    names
}

struct Candidate {
    method: u32,
    owner: String,
    name: String,
    parameters: Vec<Option<Type>>,
}

fn candidate(ctx: &Ctx, method: u32) -> Candidate {
    let owner = ctx.enclosing_type(method).and_then(|owner| ctx.class_name(owner)).unwrap_or_default();
    let parameters = ctx
        .kid(method, "FormalParameters")
        .map(|list| {
            ctx.kids_named(list, "FormalParameter")
                .filter(|formal| !receiver(ctx, *formal))
                .map(|formal| ctx.kid(formal, "VariableId").and_then(|id| ctx.type_of(id)).filter(|kind| !ctx.machine.unresolved(kind)).map(|kind| kind.erased()))
                .collect()
        })
        .unwrap_or_default();
    Candidate { method, owner, name: ctx.text(method, "Name"), parameters }
}

fn names(candidate: &Candidate, declaring: &str, method: &Method) -> bool {
    let owner_fits = candidate.owner == declaring || candidate.owner.replace('$', ".") == declaring.replace('$', ".");
    owner_fits
        && candidate.name == method.name
        && candidate.parameters.len() == method.parameters.len()
        && candidate.parameters.iter().zip(&method.parameters).all(|(own, called)| own.as_ref().is_none_or(|own| own == called))
}

fn reference_target(ctx: &Ctx, reference: u32) -> Option<(String, Method)> {
    let source = ctx.tree.nodes[reference as usize].source?;
    let resolver = ctx.machine.resolver;
    let target = resolver.lambda_target(source)?;
    let (info, function) = resolver.index.functional_method(&target.erased().name())?;
    let map = resolver.index.member_map(&target, &info.name);
    let taken: Vec<Type> = function.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect();
    let (_, declaring, method, _) = resolver.reference_method(source, &taken)?;
    Some((declaring.name.clone(), method.clone()))
}

/// Whether a single-type import names the first part of a written type, so that it is known to be a type.
fn imported(ctx: &Ctx, written: &str) -> bool {
    let first = written.split('.').next().unwrap_or(written).trim();
    ctx.all("ImportDeclaration").iter().any(|&import| {
        !ctx.flag(import, "ImportOnDemand") && !ctx.flag(import, "Static") && ctx.text(import, "ImportedSimpleName") == first
    })
}

fn unresolved_receiver_may_be_this(ctx: &Ctx, usage: u32) -> bool {
    let Some(qualifier) = ctx.qualifier(usage) else { return true };
    let own = ctx.enclosing_type(usage).and_then(|owner| ctx.class_name(owner));
    if ctx.is(qualifier, "TypeExpression") {
        return match ctx.type_of(qualifier) {
            Some(kind) => Some(kind.erased().name()) == own,
            None => !imported(ctx, ctx.source_text(qualifier)),
        };
    }
    let Some(kind) = ctx.type_of(qualifier) else { return true };
    let name = kind.erased().name();
    let unresolved = matches!(kind, Type::Class(..)) && ctx.machine.resolver.index.get(&name).is_none();
    unresolved || Some(name) == own
}

pub fn unused_private_method(ctx: &Ctx, out: &mut Vec<Hit>) {
    let ignored = ctx.property_list("ignoredAnnotations", IGNORED);
    let by_annotations = used_by_annotations(ctx);
    let mut candidates: Vec<Candidate> = ctx
        .all("MethodDeclaration")
        .iter()
        .copied()
        .filter(|&method| {
            ctx.text(method, "Visibility") == "private"
                && !ignored.iter().any(|name| ctx.annotation_present(method, name))
                && !SERIALIZATION.contains(&ctx.text(method, "Name").as_str())
                && !(ctx.arity(method) == 0 && by_annotations.contains(&ctx.text(method, "Name")))
        })
        .map(|method| candidate(ctx, method))
        .collect();
    let mut usages: Vec<u32> = ctx.all("MethodCall").to_vec();
    usages.extend_from_slice(ctx.all("MethodReference"));
    usages.sort_unstable();
    for usage in usages {
        let target = if ctx.is(usage, "MethodCall") {
            ctx.resolved(usage).map(|(call, _)| (call.declaring, call.method)).or_else(|| {
                let source = ctx.tree.nodes[usage as usize].source?;
                ctx.machine.resolver.resolve_call_as_pmd(source).map(|call| (call.declaring, call.method))
            })
        } else {
            reference_target(ctx, usage)
        };
        let Some((declaring, method)) = target else {
            if unresolved_receiver_may_be_this(ctx, usage) {
                let name = if ctx.is(usage, "MethodCall") {
                    ctx.method_name(usage)
                } else {
                    ctx.text(usage, "MethodName")
                };
                candidates.retain(|candidate| candidate.name != name);
            }
            continue;
        };
        let inside = ctx.ancestors(usage).find(|at| ctx.is(*at, "MethodDeclaration"));
        candidates.retain(|candidate| !names(candidate, &declaring, &method) || inside == Some(candidate.method));
    }
    for candidate in candidates {
        out.push(hit_with(candidate.method, &[&signature(ctx, candidate.method)]));
    }
}
