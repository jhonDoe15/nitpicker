//! Redeclarations ESLint's scope manager reads as one variable, as oxc does.
use oxc_ast::AstKind;
use oxc_semantic::{NodeId, Semantic, SymbolFlags, SymbolId};
use std::collections::HashSet;

/// The (first, again) declaration pairs of every symbol whose declarations ESLint's scope manager also binds as one
/// variable: each a value declaration bound in the scope that holds the symbol.
pub fn shared_redeclarations(semantic: &Semantic) -> HashSet<(u32, u32)> {
    let scoping = semantic.scoping();
    let mut allowed = HashSet::new();
    for symbol in scoping.symbol_ids() {
        let redeclared = scoping.symbol_redeclarations(symbol);
        if redeclared.len() < 2 || !redeclared.iter().all(|declared| shared(semantic, symbol, (declared.flags, declared.declaration))) {
            continue;
        }
        let first = redeclared[0].span.start;
        allowed.extend(redeclared[1..].iter().map(|again| (first, again.span.start)));
    }
    allowed
}

fn shared(semantic: &Semantic, symbol: SymbolId, (flags, declaration): (SymbolFlags, NodeId)) -> bool {
    let node = semantic.nodes().get_node(declaration);
    let hoisted = match node.kind() {
        AstKind::VariableDeclarator(_) => flags.contains(SymbolFlags::FunctionScopedVariable),
        AstKind::Function(function) if function.is_declaration() && function.body.is_some() => false,
        AstKind::Class(class) if class.is_declaration() && !class.declare => false,
        AstKind::FormalParameter(_) | AstKind::FormalParameterRest(_) | AstKind::CatchParameter(_) => false,
        _ => return false,
    };
    let scoping = semantic.scoping();
    let bound = if hoisted {
        scoping.scope_ancestors(node.scope_id()).find(|scope| scoping.scope_flags(*scope).is_var()).unwrap_or(node.scope_id())
    } else {
        node.scope_id()
    };
    !flags.contains(SymbolFlags::Ambient) && bound == scoping.symbol_scope_id(symbol)
}
