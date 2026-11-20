//! Per-function and per-class size figures, as `analyzeSource` of the Node analyzer reports them.
use super::shape::Shape;
use super::{ClassEntry, FunctionEntry};
use oxc_ast::AstKind;
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use std::collections::HashMap;

fn is_control(kind: AstKind) -> bool {
    matches!(
        kind,
        AstKind::IfStatement(_)
            | AstKind::ForStatement(_)
            | AstKind::ForInStatement(_)
            | AstKind::ForOfStatement(_)
            | AstKind::WhileStatement(_)
            | AstKind::DoWhileStatement(_)
            | AstKind::SwitchStatement(_)
            | AstKind::CatchClause(_)
    )
}

fn is_else_if(shape: &Shape, index: u32) -> bool {
    match (shape.kind(index), shape.parent_kind(index)) {
        (AstKind::IfStatement(inner), Some(AstKind::IfStatement(outer))) => outer.alternate.as_ref().is_some_and(|alternate| alternate.span() == inner.span),
        _ => false,
    }
}

/// What the compiler calls a statement, blocks left out.
fn is_statement(shape: &Shape, index: u32) -> bool {
    match shape.kind(index) {
        AstKind::BreakStatement(_)
        | AstKind::ContinueStatement(_)
        | AstKind::DebuggerStatement(_)
        | AstKind::DoWhileStatement(_)
        | AstKind::EmptyStatement(_)
        | AstKind::ExpressionStatement(_)
        | AstKind::Directive(_)
        | AstKind::ForInStatement(_)
        | AstKind::ForOfStatement(_)
        | AstKind::ForStatement(_)
        | AstKind::IfStatement(_)
        | AstKind::LabeledStatement(_)
        | AstKind::ReturnStatement(_)
        | AstKind::SwitchStatement(_)
        | AstKind::ThrowStatement(_)
        | AstKind::TryStatement(_)
        | AstKind::WhileStatement(_)
        | AstKind::WithStatement(_)
        | AstKind::TSTypeAliasDeclaration(_)
        | AstKind::TSInterfaceDeclaration(_)
        | AstKind::TSEnumDeclaration(_)
        | AstKind::TSNamespaceDeclaration(_)
        | AstKind::TSExternalModuleDeclaration(_)
        | AstKind::TSGlobalDeclaration(_)
        | AstKind::TSImportEqualsDeclaration(_)
        | AstKind::ImportDeclaration(_)
        | AstKind::ExportAllDeclaration(_)
        | AstKind::ExportNamedDeclaration(_)
        | AstKind::ExportFromDeclaration(_)
        | AstKind::TSExportAssignment(_)
        | AstKind::TSNamespaceExportDeclaration(_) => true,
        AstKind::VariableDeclaration(_) => {
            !matches!(shape.parent_kind(index), Some(AstKind::ForStatement(_) | AstKind::ForInStatement(_) | AstKind::ForOfStatement(_)))
        }
        AstKind::Class(class) => class.r#type == ClassType::ClassDeclaration,
        AstKind::ExportDefaultDeclaration(export) => !matches!(
            export.declaration,
            ExportDefaultDeclarationKind::FunctionDeclaration(_)
                | ExportDefaultDeclarationKind::ClassDeclaration(_)
                | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_)
        ),
        _ => false,
    }
}

struct Body {
    statements: u32,
    nesting: u32,
}

fn measure(shape: &Shape, index: u32, depth: u32, body: &mut Body) {
    for child in shape.tree.children(index) {
        if shape.function_like(child) {
            continue;
        }
        let inside = if is_control(shape.kind(child)) && !is_else_if(shape, child) { depth + 1 } else { depth };
        body.nesting = body.nesting.max(inside);
        body.statements += u32::from(is_statement(shape, child));
        measure(shape, child, inside, body);
    }
}

fn body_metrics(shape: &Shape, unit: u32) -> Body {
    let mut body = Body { statements: 0, nesting: 0 };
    if let Some(root) = shape.body(unit) {
        if !shape.function_like(root) {
            measure(shape, root, 0, &mut body);
        }
    }
    body
}

/// Stray `;` between class members: the compiler counts each as a member.
fn stray_semicolons(shape: &Shape, class: &Class) -> u32 {
    let text = shape.file.text.as_bytes();
    let mut count = 0;
    let mut at = class.body.span.start as usize + 1;
    let end = class.body.span.end as usize;
    let mut members = class.body.body.iter().peekable();
    loop {
        let (stop, resume, owns) = match members.next() {
            Some(member) => {
                let span = member.span();
                let owns = match member {
                    ClassElement::MethodDefinition(method) => method.value.body.is_none(),
                    ClassElement::StaticBlock(_) => false,
                    _ => true,
                };
                (span.start as usize, span.end as usize, owns && text[span.end as usize - 1] != b';')
            }
            None => (end, end, false),
        };
        count += semicolons(shape, at, stop);
        if resume >= end {
            break;
        }
        at = resume;
        if owns {
            at = shape.with_semicolon(resume as u32) as usize;
        }
    }
    count
}

fn semicolons(shape: &Shape, from: usize, to: usize) -> u32 {
    let bytes = shape.file.text.as_bytes();
    let mut count = 0;
    let mut at = from;
    while at < to {
        match bytes[at] {
            b';' => {
                count += 1;
                at += 1;
            }
            b'/' if bytes.get(at + 1) == Some(&b'/') => {
                while at < to && bytes[at] != b'\n' {
                    at += 1;
                }
            }
            b'/' if bytes.get(at + 1) == Some(&b'*') => {
                at += 2;
                while at + 1 < to && !(bytes[at] == b'*' && bytes[at + 1] == b'/') {
                    at += 1;
                }
                at += 2;
            }
            _ => at += 1,
        }
    }
    count
}

pub fn entries(shape: &Shape, names: &HashMap<u32, String>, display: &str) -> (Vec<FunctionEntry>, Vec<ClassEntry>) {
    let lines = &shape.file.lines;
    let mut functions = Vec::new();
    let mut classes = Vec::new();
    for index in 0..shape.tree.nodes.len() as u32 {
        if shape.function_like(index) && !shape.curried_inner(index) {
            let mut chain = vec![index];
            while let Some(next) = shape.curried_body(*chain.last().expect("chain")) {
                chain.push(next);
            }
            let body = body_metrics(shape, *chain.last().expect("chain"));
            let start = lines.line(shape.start(index));
            let end = lines.line(shape.end(index));
            functions.push((
                shape.start(index),
                index,
                FunctionEntry {
                    source: display.to_string(),
                    function: names.get(&index).cloned().unwrap_or_default(),
                    start,
                    end,
                    lines: end - start + 1,
                    parameters: chain.iter().map(|link| shape.parameters(*link)).max().unwrap_or(0),
                    statements: body.statements,
                    max_control_nesting: body.nesting,
                },
            ));
        }
        if let AstKind::Class(class) = shape.kind(index) {
            let start = lines.line(shape.start(index));
            let end = lines.line(shape.end(index));
            let listed = class.body.body.len() as u32;
            classes.push((
                shape.start(index),
                index,
                ClassEntry {
                    source: display.to_string(),
                    class: class.id.as_ref().map_or_else(|| "<anonymous>".to_string(), |id| id.name.to_string()),
                    start,
                    end,
                    lines: end - start + 1,
                    members: listed + stray_semicolons(shape, class),
                    methods: class.body.body.iter().filter(|member| matches!(member, ClassElement::MethodDefinition(_))).count() as u32,
                },
            ));
        }
    }
    functions.sort_by_key(|(start, index, _)| (*start, *index));
    classes.sort_by_key(|(start, index, _)| (*start, *index));
    (functions.into_iter().map(|(_, _, entry)| entry).collect(), classes.into_iter().map(|(_, _, entry)| entry).collect())
}
