//! What the forwarding rules read from the compiler's tree of a file: modifiers, parameters, heritage clauses
//! and documentation tags of a declaration, named by the compiler's handle.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::kind;
use std::rc::Rc;

pub struct ParameterFacts {
    pub handle: String,
    pub optional: bool,
    pub rest: bool,
}

pub struct MethodFacts {
    pub is_method: bool,
    pub asynchronous: bool,
    pub is_abstract: bool,
    pub visibility: u8,
    pub has_predicate: bool,
    pub generic: bool,
    pub deprecated: bool,
    pub parameters: Vec<ParameterFacts>,
    pub parent: Option<String>,
}

pub struct ClassFacts {
    pub heritage: bool,
    pub extends: bool,
    pub implements: Vec<String>,
}

fn is_deprecated(table: &NodeTable, method: u32) -> bool {
    (1..table.count()).any(|tag| {
        table.kind(tag) == kind::JS_DOC_DEPRECATED_TAG
            && table.parent(tag).filter(|comment| table.kind(*comment) == kind::JS_DOC).and_then(|comment| table.parent(comment)) == Some(method)
    })
}

fn is_this(table: &NodeTable, parameter: u32) -> bool {
    table.child(parameter, "name").is_some_and(|name| table.kind(name) == kind::IDENTIFIER && table.text(name).as_deref() == Some("this"))
}

fn is_required(table: &NodeTable, parameter: u32) -> bool {
    ["questionToken", "initializer", "dotDotDotToken"].iter().all(|part| table.child(parameter, part).is_none())
}

impl Types {
    fn tree_of(&mut self, handle: &str) -> Option<(Rc<NodeTable>, u32, String)> {
        let (index, _, path) = parse_handle(handle)?;
        let table = self.session.table(path);
        let table = self.answered(table.map(Some))?;
        Some((table, index, path.to_string()))
    }

    pub fn method_facts(&mut self, handle: &str) -> Option<MethodFacts> {
        let (table, index, path) = self.tree_of(handle)?;
        let private_name = table.child(index, "name").is_some_and(|name| table.kind(name) == kind::PRIVATE_IDENTIFIER);
        let visibility = if private_name || table.has_modifier(index, kind::PRIVATE_KEYWORD) {
            2
        } else {
            u8::from(table.has_modifier(index, kind::PROTECTED_KEYWORD))
        };
        let parameter = |parameter: u32| ParameterFacts {
            handle: table.handle(parameter, &path),
            optional: table.child(parameter, "questionToken").is_some(),
            rest: table.child(parameter, "dotDotDotToken").is_some(),
        };
        Some(MethodFacts {
            is_method: table.kind(index) == kind::METHOD_DECLARATION,
            asynchronous: table.has_modifier(index, kind::ASYNC_KEYWORD),
            is_abstract: table.has_modifier(index, kind::ABSTRACT_KEYWORD),
            visibility,
            has_predicate: table.child(index, "type").is_some_and(|written| table.kind(written) == kind::TYPE_PREDICATE),
            generic: table.has_list(index, "typeParameters"),
            deprecated: is_deprecated(&table, index),
            parameters: table.listed(index, "parameters").into_iter().map(parameter).collect(),
            parent: table.parent(index).map(|parent| table.handle(parent, &path)),
        })
    }

    pub fn class_facts(&mut self, handle: &str) -> Option<ClassFacts> {
        let (table, index, path) = self.tree_of(handle)?;
        let clauses = table.listed(index, "heritageClauses");
        let implementing = |clause: &u32| table.node_text(*clause).starts_with("implements");
        let types = |clause: u32| table.listed(clause, "types").into_iter().map(|node| table.handle(node, &path)).collect::<Vec<_>>();
        Some(ClassFacts {
            heritage: !clauses.is_empty(),
            extends: clauses.iter().any(|clause| !implementing(clause) && !types(*clause).is_empty()),
            implements: clauses.iter().filter(|clause| implementing(clause)).flat_map(|clause| types(*clause)).collect(),
        })
    }

    /// The handle of the declaration's parent, for telling whether two declarations have the same owner.
    pub fn parent_of(&mut self, handle: &str) -> Option<String> {
        let (table, index, path) = self.tree_of(handle)?;
        table.parent(index).map(|parent| table.handle(parent, &path))
    }

    /// Whether the declaration is an async function, or a variable that starts as one.
    pub fn is_async_declaration(&mut self, handle: &str) -> bool {
        let Some((table, index, _)) = self.tree_of(handle) else { return false };
        let function = if table.kind(index) == kind::VARIABLE_DECLARATION { table.child(index, "initializer") } else { Some(index) };
        function.is_some_and(|function| table.has_modifier(function, kind::ASYNC_KEYWORD))
    }

    /// The `optional` and `rest` of a parameter declaration as `isOptionalParameter` and its rest token say;
    /// `None` for a declaration that is not a parameter.
    pub fn parameter_shape(&mut self, handle: &str) -> Option<(bool, bool)> {
        let (table, index, _) = self.tree_of(handle)?;
        if table.kind(index) != kind::PARAMETER {
            return None;
        }
        let rest = table.child(index, "dotDotDotToken").is_some();
        let mut optional = table.child(index, "questionToken").is_some();
        if !optional && table.child(index, "initializer").is_some() {
            let parameters = table.listed(table.parent(index)?, "parameters");
            let position = parameters.iter().position(|parameter| *parameter == index)?;
            let counted: Vec<u32> = parameters.iter().copied().filter(|parameter| !is_this(&table, *parameter)).collect();
            let minimum = counted.iter().rposition(|parameter| is_required(&table, *parameter)).map_or(0, |last| last + 1);
            optional = position >= minimum;
        }
        Some((optional, rest))
    }
}
