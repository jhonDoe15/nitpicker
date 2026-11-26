//! `resolveCall`: what one call does, either directly (a library's API, a name that looks like input or
//! output) or through the functions it calls, which the summaries then follow.
use super::super::flow::{is_consumed, is_terminal_method};
use super::super::packages::{IoKind, library_kind};
use super::super::tags::{Effects, direct_effects, named_kind};
use super::super::views::{At, CallView, call_view, callee};
use super::declarations::{callee_declaration, container_name, declaration_package, function_like, imported_package};
use super::implementations::{Index, implementations_of};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;
use std::rc::Rc;

/// One call of a function body: its view, and either its own effects or the functions it runs.
pub struct Resolved {
    pub view: CallView<At>,
    pub effects: Option<Effects>,
    pub guessed: bool,
    pub targets: Option<Vec<String>>,
}

/// The package a callee is declared in and the class or interface it is a member of.
pub struct CalleeOrigin {
    pub package: Option<String>,
    pub owner: Option<String>,
}

fn effects(view: CallView<At>, effects: Effects, guessed: bool) -> Resolved {
    Resolved { view, effects: Some(effects), guessed, targets: None }
}

fn targets(view: CallView<At>, targets: Vec<At>) -> Resolved {
    Resolved { view, effects: None, guessed: false, targets: Some(targets.iter().map(At::handle).collect()) }
}

/// `calleeParts`: the callee through parentheses and `!`, the node naming it, and the receiver of a member.
fn callee_parts(call: &At) -> Option<(At, At, Option<At>)> {
    let mut callee = callee(call)?;
    while matches!(callee.kind(), k::PARENTHESIZED_EXPRESSION | k::NON_NULL_EXPRESSION) {
        let Some(inner) = callee.child("expression") else { break };
        callee = inner;
    }
    let member = matches!(callee.kind(), k::PROPERTY_ACCESS_EXPRESSION | k::ELEMENT_ACCESS_EXPRESSION);
    let name = if callee.is(k::PROPERTY_ACCESS_EXPRESSION) { callee.child("name")? } else { callee.clone() };
    let receiver = if member { callee.child("expression") } else { None };
    Some((callee, name, receiver))
}

/// `isAsyncCall`.
fn is_async_call(types: &mut Types, call: &At) -> bool {
    let last = call.listed("arguments").pop().filter(|_| call.is(k::CALL_EXPRESSION));
    if last.is_some_and(|last| matches!(last.kind(), k::ARROW_FUNCTION | k::FUNCTION_EXPRESSION)) {
        return true;
    }
    types.is_awaitable_call(&call.handle())
}

/// `asyncGate`.
fn is_async(types: &mut Types, call: &At, view: &CallView<At>, builder: bool) -> bool {
    let used = !builder || is_terminal_method(view.method.as_deref()) || is_consumed(call);
    used && is_async_call(types, call)
}

fn kind_of(types: &mut Types, call: &At, view: &CallView<At>, package: &str) -> Option<IoKind> {
    library_kind(package, view, &mut |builder| is_async(types, call, view, builder))
}

/// `libraryEffects`: the first declaration that belongs to a package whose API does input or output.
fn library_effects(types: &mut Types, call: &At, view: &CallView<At>, declarations: &[Option<At>]) -> Option<Effects> {
    for declaration in declarations.iter().flatten() {
        let Some(package) = declaration_package(types, declaration) else { continue };
        if let Some(kind) = kind_of(types, call, view, &package) {
            return Some(direct_effects(Some(kind), Some(&package), view));
        }
    }
    None
}

/// `namedEffects`: by the package the chain's root is imported from, or else by the names alone (a guess).
fn named_effects(types: &mut Types, call: &At, view: CallView<At>) -> Resolved {
    let package = imported_package(types, view.root.as_ref());
    let kind = package.as_deref().and_then(|package| kind_of(types, call, &view, package));
    match kind {
        None => {
            let found = direct_effects(named_kind(&view), package.as_deref(), &view);
            effects(view, found, true)
        }
        Some(kind) => {
            let found = direct_effects(Some(kind), package.as_deref(), &view);
            effects(view, found, false)
        }
    }
}

fn library_call_effects(types: &mut Types, call: &At, view: &CallView<At>, declarations: &[Option<At>]) -> Effects {
    if view.names.len() == 1 && named_kind(view) == Some(IoKind::Remote) {
        return direct_effects(Some(IoKind::Remote), None, view);
    }
    library_effects(types, call, view, declarations).unwrap_or_default()
}

fn project_call(types: &mut Types, index: &mut dyn FnMut(&mut Types) -> Rc<Index>, call: &At, view: CallView<At>, declaration: &At) -> Resolved {
    let found = match function_like(declaration) {
        Some(function) => vec![function],
        None => {
            let index = index(types);
            implementations_of(types, &index, declaration)
        }
    };
    if found.is_empty() { named_effects(types, call, view) } else { targets(view, found) }
}

fn type_declaration(types: &mut Types, node: Option<&At>) -> Option<At> {
    let declaration = types.type_declaration(&node?.handle())?;
    At::of(types, &declaration)
}

/// `resolveCall`. `index` gives the run's implementation index, built on first use.
pub fn resolve_call(types: &mut Types, index: &mut dyn FnMut(&mut Types) -> Rc<Index>, call: &At) -> Option<Resolved> {
    let view = call_view(types, call)?;
    let Some((callee, name, receiver)) = callee_parts(call) else { return Some(named_effects(types, call, view)) };
    let Some(declaration) = callee_declaration(types, &name) else { return Some(named_effects(types, call, view)) };
    let package = declaration_package(types, &declaration);
    if let Some(function) = function_like(&declaration).filter(|_| package.is_none()) {
        return Some(targets(view, vec![function]));
    }
    let receiver_type = type_declaration(types, receiver.as_ref());
    let callee_type = type_declaration(types, Some(&callee));
    if package.is_some() {
        let found = library_call_effects(types, call, &view, &[receiver_type, Some(declaration), callee_type]);
        return Some(effects(view, found, false));
    }
    match library_effects(types, call, &view, &[callee_type, receiver_type]) {
        Some(found) => Some(effects(view, found, false)),
        None => Some(project_call(types, index, call, view, &declaration)),
    }
}

/// `calleeOrigin`.
pub fn callee_origin(types: &mut Types, call: &At) -> Option<CalleeOrigin> {
    let (_, name, _) = callee_parts(call)?;
    let declaration = callee_declaration(types, &name)?;
    Some(CalleeOrigin { package: declaration_package(types, &declaration), owner: container_name(&declaration) })
}
