//! Which identifiers read a name and which declare one, as the Node analyzer decides it on the compiler's tree.
use crate::typescript::tree::Tree;
use oxc_ast::AstKind;
use std::cmp::Ordering;
use std::collections::HashMap;

pub type Span = (u32, u32);

/// Occurrences by start offset.
pub struct Names<'a> {
    pub references: Vec<(u32, &'a str)>,
    pub declared: Vec<(u32, &'a str)>,
    /// First and last read of each name.
    reads: HashMap<&'a str, (u32, u32)>,
}

/// The order JavaScript sorts strings in: by UTF-16 code unit.
pub fn by_code_unit(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn within<'n, 'a>(list: &'n [(u32, &'a str)], span: Span) -> &'n [(u32, &'a str)] {
    let first = list.partition_point(|(at, _)| *at < span.0);
    let last = list.partition_point(|(at, _)| *at < span.1);
    &list[first..last.max(first)]
}

impl<'a> Names<'a> {
    pub fn of(tree: &Tree<'a>) -> Names<'a> {
        let mut references = Vec::new();
        let mut declared = Vec::new();
        for (index, node) in tree.nodes.iter().enumerate() {
            let parent = tree.parent(index as u32).map(|parent| tree.kind(parent));
            match node.kind {
                AstKind::IdentifierReference(identifier) => {
                    let named_only = matches!(
                        parent,
                        Some(AstKind::ExportSpecifier(_) | AstKind::ExportDefaultDeclaration(_) | AstKind::TSExportAssignment(_))
                    );
                    if !named_only {
                        references.push((node.start, identifier.name.as_str()));
                    }
                }
                AstKind::JSXIdentifier(identifier) => {
                    let read = match parent {
                        Some(AstKind::JSXOpeningElement(_) | AstKind::JSXClosingElement(_)) => true,
                        Some(AstKind::JSXNamespacedName(name)) => name.namespace.span.start == node.start,
                        _ => false,
                    };
                    if read {
                        references.push((node.start, identifier.name.as_str()));
                    }
                }
                AstKind::IdentifierName(identifier) => {
                    let read = match parent {
                        Some(AstKind::TSTypePredicate(_) | AstKind::TSImportType(_)) => true,
                        Some(AstKind::TSImportTypeQualifiedName(name)) => name.span.start == node.start,
                        _ => false,
                    };
                    if read {
                        references.push((node.start, identifier.name.as_str()));
                    }
                }
                AstKind::BindingIdentifier(identifier) => {
                    let named_only = matches!(
                        parent,
                        Some(
                            AstKind::TSInterfaceDeclaration(_)
                                | AstKind::TSTypeAliasDeclaration(_)
                                | AstKind::TSEnumDeclaration(_)
                                | AstKind::TSNamespaceDeclaration(_)
                                | AstKind::TSImportEqualsDeclaration(_)
                                | AstKind::ImportSpecifier(_)
                                | AstKind::ImportDefaultSpecifier(_)
                                | AstKind::ImportNamespaceSpecifier(_)
                        )
                    );
                    if !named_only {
                        declared.push((node.start, identifier.name.as_str()));
                    }
                }
                AstKind::TSIndexSignatureName(name) => declared.push((node.start, name.name.as_str())),
                _ => {}
            }
        }
        references.sort_unstable();
        declared.sort_unstable();
        let mut reads: HashMap<&str, (u32, u32)> = HashMap::new();
        for (at, name) in &references {
            reads.entry(name).or_insert((*at, *at)).1 = *at;
        }
        Names { references, declared, reads }
    }

    pub fn declared_in(&self, span: Span) -> impl Iterator<Item = &'a str> + '_ {
        within(&self.declared, span).iter().map(|(_, name)| *name)
    }

    /// Names read inside the spans and declared in none of them, each once, in JavaScript's sort order.
    pub fn free(&self, spans: &[Span]) -> Vec<&'a str> {
        let declared: std::collections::HashSet<&str> = spans.iter().flat_map(|span| self.declared_in(*span)).collect();
        let mut free: Vec<&str> =
            spans.iter().flat_map(|span| within(&self.references, *span)).map(|(_, name)| *name).filter(|name| !declared.contains(name)).collect();
        free.sort_unstable_by(|left, right| by_code_unit(left, right));
        free.dedup();
        free
    }

    pub fn read_outside(&self, name: &str, span: Span) -> bool {
        self.reads.get(name).is_some_and(|(first, last)| *first < span.0 || *last >= span.1)
    }
}
