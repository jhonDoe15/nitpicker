//! What the rules ask of ESLint's scope manager, answered from oxc's scopes and references and given back as
//! nodes of the ESTree-shaped view.
use super::view::{Node, Value, View};
use oxc_ast::AstKind;
use oxc_semantic::{ReferenceId, ScopeId, Semantic, SymbolId};
use oxc_span::GetSpan;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DefKind {
    Variable,
    Parameter,
    FunctionName,
    ClassName,
    ImportBinding,
    CatchClause,
    Type,
    Other,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ScopeKind {
    Global,
    Module,
    Function,
    Class,
    Block,
}

pub struct Def<'v> {
    pub kind: DefKind,
    /// `definition.node`: the declarator, function, class, import specifier or catch clause.
    pub node: Node<'v>,
    pub name: Node<'v>,
}

pub struct Reference<'v> {
    pub identifier: Node<'v>,
    pub read: bool,
    pub write: bool,
    /// A use in a type, as in `typeof value`: a read for the ESLint scope manager.
    pub as_type: bool,
}

enum Use {
    Reference(ReferenceId),
    Binding(SymbolId),
}

pub struct Scopes<'a, 's> {
    semantic: &'s Semantic<'a>,
    view: &'s View,
    identifiers: HashMap<u32, u32>,
    blocks: HashMap<(u32, u32), u32>,
    uses: HashMap<u32, Use>,
    spans: Vec<(u32, u32, ScopeId)>,
}

const FUNCTIONS: [&str; 5] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "TSDeclareFunction", "TSEmptyBodyFunctionExpression"];
const BLOCKS: [&str; 12] = [
    "ClassDeclaration", "ClassExpression", "BlockStatement", "ForStatement", "ForInStatement", "ForOfStatement", "CatchClause",
    "SwitchStatement", "TSModuleDeclaration", "StaticBlock", "ClassBody", "Program",
];

impl<'a, 's> Scopes<'a, 's> {
    pub fn of(semantic: &'s Semantic<'a>, view: &'s View) -> Scopes<'a, 's> {
        let mut identifiers = HashMap::new();
        let mut blocks = HashMap::new();
        for node in view.nodes() {
            let kind = node.kind();
            if kind == "Identifier" || kind == "JSXIdentifier" {
                let exported_alias = node.parent().is_some_and(|parent| parent.is("ExportSpecifier") && parent.node("exported") == Some(node));
                if !(exported_alias && identifiers.contains_key(&node.start())) {
                    identifiers.insert(node.start(), node.index);
                }
            } else if FUNCTIONS.contains(&kind) || BLOCKS.contains(&kind) {
                blocks.insert((node.start(), node.end()), node.index);
            }
        }
        let mut uses = HashMap::new();
        for node in semantic.nodes().iter() {
            match node.kind() {
                AstKind::IdentifierReference(reference) => uses.insert(reference.span.start, Use::Reference(reference.reference_id())),
                AstKind::BindingIdentifier(binding) => binding.symbol_id.get().and_then(|symbol| uses.insert(binding.span.start, Use::Binding(symbol))),
                _ => None,
            };
        }
        let scoping = semantic.scoping();
        let mut spans: Vec<(u32, u32, ScopeId)> = scoping
            .scope_descendants_from_root()
            .map(|scope| {
                let span = semantic.nodes().kind(scoping.get_node_id(scope)).span();
                (span.start, span.end, scope)
            })
            .collect();
        spans.sort_by_key(|(start, end, _)| (*start, std::cmp::Reverse(*end)));
        Scopes { semantic, view, identifiers, blocks, uses, spans }
    }

    fn scope_at(&self, offset: u32) -> ScopeId {
        let scoping = self.semantic.scoping();
        let index = self.spans.partition_point(|(start, _, _)| *start <= offset);
        let Some(&(_, _, last)) = index.checked_sub(1).and_then(|at| self.spans.get(at)) else { return scoping.root_scope_id() };
        let contains = |scope: ScopeId| {
            let span = self.semantic.nodes().kind(scoping.get_node_id(scope)).span();
            span.start <= offset && offset < span.end
        };
        scoping.scope_ancestors(last).find(|scope| contains(*scope)).unwrap_or_else(|| scoping.root_scope_id())
    }

    pub fn variable_named(&self, identifier: Node) -> Option<SymbolId> {
        let scoping = self.semantic.scoping();
        match self.uses.get(&identifier.start()) {
            Some(Use::Reference(reference)) => scoping.get_reference(*reference).symbol_id(),
            Some(Use::Binding(symbol)) => Some(*symbol),
            None => {
                let name = identifier.name()?;
                scoping.scope_ancestors(self.scope_at(identifier.start())).find_map(|scope| {
                    scoping.get_bindings(scope).iter().find(|(bound, _)| bound.as_str() == name.as_ref()).map(|(_, symbol)| *symbol)
                })
            }
        }
    }

    /// The variable a name has in the scope at an offset, as `scope.set` looked up along the chain.
    pub fn variable_by_name(&self, name: &str, offset: u32) -> Option<SymbolId> {
        let scoping = self.semantic.scoping();
        scoping.scope_ancestors(self.scope_at(offset)).find_map(|scope| {
            scoping.get_bindings(scope).iter().find(|(bound, _)| bound.as_str() == name).map(|(_, symbol)| *symbol)
        })
    }

    pub fn name(&self, symbol: SymbolId) -> &str {
        self.semantic.scoping().symbol_name(symbol)
    }

    fn identifier_at(&self, start: u32) -> Option<Node<'s>> {
        self.identifiers.get(&start).map(|index| self.view.at(*index))
    }

    pub fn defs(&self, symbol: SymbolId) -> Vec<Def<'s>> {
        let scoping = self.semantic.scoping();
        let nodes = self.semantic.nodes();
        let redeclared = scoping.symbol_redeclarations(symbol);
        let declared: Vec<(u32, AstKind)> = if redeclared.is_empty() {
            vec![(scoping.symbol_span(symbol).start, nodes.kind(scoping.symbol_declaration(symbol)))]
        } else {
            redeclared.iter().map(|again| (again.span.start, nodes.kind(again.declaration))).collect()
        };
        declared
            .into_iter()
            .filter_map(|(start, declaration)| {
                let name = self.identifier_at(start)?;
                let (kind, wanted): (DefKind, &[&str]) = match declaration {
                    AstKind::VariableDeclarator(_) => (DefKind::Variable, &["VariableDeclarator"]),
                    AstKind::FormalParameter(_) | AstKind::FormalParameterRest(_) => (DefKind::Parameter, &FUNCTIONS),
                    AstKind::Function(_) => (DefKind::FunctionName, &FUNCTIONS),
                    AstKind::Class(_) => (DefKind::ClassName, &["ClassDeclaration", "ClassExpression"]),
                    AstKind::ImportSpecifier(_) | AstKind::ImportDefaultSpecifier(_) | AstKind::ImportNamespaceSpecifier(_) => {
                        (DefKind::ImportBinding, &["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier"])
                    }
                    AstKind::CatchParameter(_) | AstKind::CatchClause(_) => (DefKind::CatchClause, &["CatchClause"]),
                    AstKind::TSTypeAliasDeclaration(_) => (DefKind::Type, &["TSTypeAliasDeclaration"]),
                    AstKind::TSInterfaceDeclaration(_) => (DefKind::Type, &["TSInterfaceDeclaration"]),
                    AstKind::TSTypeParameter(_) => (DefKind::Type, &["TSTypeParameter"]),
                    AstKind::TSEnumDeclaration(_) => (DefKind::Other, &["TSEnumDeclaration"]),
                    AstKind::TSNamespaceDeclaration(_) => (DefKind::Other, &["TSModuleDeclaration"]),
                    AstKind::TSImportEqualsDeclaration(_) => (DefKind::ImportBinding, &["TSImportEqualsDeclaration"]),
                    _ => return None,
                };
                let node = std::iter::once(name).chain(name.ancestors()).find(|candidate| wanted.contains(&candidate.kind()))?;
                Some(Def { kind, node, name })
            })
            .collect()
    }

    fn initialized(definition: &Def) -> bool {
        if definition.kind != DefKind::Variable {
            return false;
        }
        let looped = definition.node.parent().and_then(|declaration| declaration.parent().map(|statement| (declaration, statement)));
        definition.node.get("init") != Value::Null
            || looped.is_some_and(|(declaration, statement)| {
                matches!(statement.kind(), "ForInStatement" | "ForOfStatement") && statement.node("left") == Some(declaration)
            })
    }

    /// `variable.references`, the write at an initialized declaration included, in source order.
    pub fn references(&self, symbol: SymbolId) -> Vec<Reference<'s>> {
        let scoping = self.semantic.scoping();
        let nodes = self.semantic.nodes();
        let mut found: Vec<Reference> = scoping
            .get_resolved_references(symbol)
            .filter_map(|reference| {
                let identifier = self.identifier_at(nodes.kind(reference.node_id()).span().start)?;
                Some(Reference { identifier, read: reference.is_read(), write: reference.is_write(), as_type: reference.flags().is_type() })
            })
            .collect();
        let written = self.defs(symbol).into_iter().filter(Self::initialized);
        found.extend(written.map(|definition| Reference { identifier: definition.name, read: false, write: true, as_type: false }));
        found.sort_by_key(|reference| reference.identifier.start());
        found
    }

    /// `variable.references` as the ESLint scope manager lists them: also the names oxc leaves without a reference,
    /// the entity of `import x = name` and the parameter name of a type predicate, as reads in a type.
    pub fn references_with_types(&self, symbol: SymbolId) -> Vec<Reference<'s>> {
        let mut found = self.references(symbol);
        for node in self.view.nodes() {
            let named = if node.is("TSImportEqualsDeclaration") {
                let mut entity = node.node("moduleReference");
                while let Some(qualified) = entity.filter(|entity| entity.is("TSQualifiedName")) {
                    entity = qualified.node("left");
                }
                entity
            } else if node.is("TSTypePredicate") {
                node.node("parameterName")
            } else {
                None
            };
            let Some(identifier) = named.filter(|named| named.is("Identifier")) else { continue };
            let resolved = identifier.name().and_then(|name| self.variable_by_name(&name, identifier.start()));
            if resolved == Some(symbol) {
                found.push(Reference { identifier, read: false, write: false, as_type: true });
            }
        }
        found.sort_by_key(|reference| reference.identifier.start());
        found
    }

    fn block_of(&self, scope: ScopeId) -> Option<(ScopeKind, Node<'s>)> {
        let scoping = self.semantic.scoping();
        let declared = self.semantic.nodes().kind(scoping.get_node_id(scope));
        let kind = match declared {
            AstKind::Program(_) if self.semantic.source_type().is_module() => ScopeKind::Module,
            AstKind::Program(_) => ScopeKind::Global,
            AstKind::Function(_) | AstKind::ArrowFunctionExpression(_) => ScopeKind::Function,
            AstKind::Class(_) => ScopeKind::Class,
            _ => ScopeKind::Block,
        };
        let span = declared.span();
        let block = if matches!(declared, AstKind::Program(_)) { Some(self.view.program()) } else { self.blocks.get(&(span.start, span.end)).map(|index| self.view.at(*index)) };
        block.map(|node| (kind, node))
    }

    /// `variable.scope`: its type and its `block`.
    pub fn scope_of(&self, symbol: SymbolId) -> Option<(ScopeKind, Node<'s>)> {
        self.block_of(self.semantic.scoping().symbol_scope_id(symbol))
    }

    /// `scopeManager.acquire(node).variables` for a program or function, in source order.
    pub fn acquired(&self, container: Node) -> Vec<SymbolId> {
        let scoping = self.semantic.scoping();
        if container.is("Program") && self.semantic.source_type().is_module() {
            return Vec::new();
        }
        if container.is("FunctionExpression") && let Some(id) = container.node("id") {
            return self.variable_named(id).into_iter().collect();
        }
        let scope = scoping.scope_descendants_from_root().find(|scope| self.block_of(*scope).is_some_and(|(_, block)| block == container));
        let mut variables: Vec<SymbolId> = scope.map(|scope| scoping.get_bindings(scope).values().copied().collect()).unwrap_or_default();
        variables.sort_by_key(|symbol| scoping.symbol_span(*symbol).start);
        variables
    }

    /// References the file leaves to the global scope, by name.
    pub fn through(&self, name: &str) -> Vec<Node<'s>> {
        let scoping = self.semantic.scoping();
        let nodes = self.semantic.nodes();
        let unresolved = scoping.root_unresolved_references().iter().filter(|(found, _)| found.as_str() == name);
        unresolved.flat_map(|(_, references)| references.iter()).filter_map(|reference| self.identifier_at(nodes.kind(scoping.get_reference(*reference).node_id()).span().start)).collect()
    }
}
