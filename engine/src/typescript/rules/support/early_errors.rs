//! The semantic errors that make a file `!parse`: those typescript-estree also refuses.
use oxc_ast::AstKind;
use oxc_semantic::{NodeId, Semantic, SemanticBuilderReturn, SymbolFlags, SymbolId};
use std::collections::HashSet;

pub fn refused(built: &SemanticBuilderReturn) -> bool {
    if built.diagnostics.is_empty() {
        return false;
    }
    let allowed = functions_over_parameters(&built.semantic);
    built.diagnostics.iter().any(|diagnostic| {
        let spans: Vec<u32> = diagnostic.labels.iter().filter_map(|label| u32::try_from(label.offset()).ok()).collect();
        let redeclared = diagnostic.message.ends_with("has already been declared");
        !(redeclared && matches!(spans[..], [first, again] if allowed.contains(&(first, again))))
    })
}

fn functions_over_parameters(semantic: &Semantic) -> HashSet<(u32, u32)> {
    let scoping = semantic.scoping();
    let mut allowed = HashSet::new();
    for symbol in scoping.symbol_ids() {
        let redeclared = scoping.symbol_redeclarations(symbol);
        let parameters: Vec<u32> = redeclared
            .iter()
            .filter(|earlier| parameter(semantic, earlier.flags, earlier.declaration))
            .map(|earlier| earlier.span.start)
            .collect();
        let functions = redeclared.iter().filter(|later| body_function(semantic, symbol, later.flags, later.declaration));
        for later in functions.filter(|_| !parameters.is_empty()) {
            allowed.extend(parameters.iter().map(|first| (*first, later.span.start)));
        }
    }
    allowed
}

fn parameter(semantic: &Semantic, flags: SymbolFlags, declaration: NodeId) -> bool {
    flags == SymbolFlags::FunctionScopedVariable
        && matches!(semantic.nodes().kind(declaration), AstKind::FormalParameter(_) | AstKind::FormalParameterRest(_))
}

fn body_function(semantic: &Semantic, symbol: SymbolId, flags: SymbolFlags, declaration: NodeId) -> bool {
    let node = semantic.nodes().get_node(declaration);
    node.scope_id() == semantic.scoping().symbol_scope_id(symbol)
        && !flags.contains(SymbolFlags::Ambient)
        && matches!(node.kind(), AstKind::Function(function) if function.is_declaration() && function.body.is_some())
}
