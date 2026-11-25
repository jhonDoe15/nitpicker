//! Top-level definitions of one file with the token texts the duplicate rules compare.
use super::parts::Parts;
use super::references::{Names, Span};
use super::untyped::TypeOnly;
use crate::typescript::ParsedFile;
use crate::typescript::strings::Halves;
use crate::typescript::tokens::TokenTexts;
use oxc_ast::ast::{
    ArrayExpressionElement, BindingPattern, ChainElement, Class, Declaration, ExportDefaultDeclarationKind, Expression, Function, ObjectPropertyKind,
    PropertyKey, PropertyKind, Statement, TSEnumDeclaration, TSExternalModuleDeclaration, TSGlobalDeclaration, TSImportEqualsDeclaration,
    TSInterfaceDeclaration, TSNamespaceDeclaration, TSNamespaceDeclarationBody, TSNamespaceExportDeclaration, TSTypeAliasDeclaration, UnaryOperator,
    VariableDeclaration, VariableDeclarationKind,
};
use oxc_span::GetSpan;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Binding {
    Import { specifier: String, imported: String },
    Local { text: String },
}

#[derive(Serialize, Debug, Clone)]
pub struct Free {
    pub name: String,
    pub binding: Binding,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    pub name: String,
    pub kind: &'static str,
    pub text: String,
    pub tokens: Vec<String>,
    pub untyped_tokens: Vec<String>,
    pub free: Vec<Free>,
    pub size: usize,
    pub exported: bool,
    pub is_default: bool,
    pub literal: bool,
    pub component: bool,
    pub line: u32,
    pub lines: u32,
    pub used_locally: bool,
}

pub enum Declared<'a> {
    Variable(&'a VariableDeclaration<'a>),
    Function(&'a Function<'a>),
    Class(&'a Class<'a>),
    Interface(&'a TSInterfaceDeclaration<'a>),
    Alias(&'a TSTypeAliasDeclaration<'a>),
    Enum(&'a TSEnumDeclaration<'a>),
    Namespace(&'a TSNamespaceDeclaration<'a>),
    External(&'a TSExternalModuleDeclaration<'a>),
    Global(&'a TSGlobalDeclaration<'a>),
    ImportEquals(&'a TSImportEqualsDeclaration<'a>),
    NamespaceExport(&'a TSNamespaceExportDeclaration<'a>),
}

/// A top-level statement that names something, with the `export` around it.
pub struct Top<'a> {
    pub span: Span,
    pub exported: bool,
    pub is_default: bool,
    pub declared: Declared<'a>,
}

fn declared_of<'a>(declaration: &'a Declaration<'a>) -> Declared<'a> {
    match declaration {
        Declaration::VariableDeclaration(node) => Declared::Variable(node),
        Declaration::FunctionDeclaration(node) => Declared::Function(node),
        Declaration::ClassDeclaration(node) => Declared::Class(node),
        Declaration::TSTypeAliasDeclaration(node) => Declared::Alias(node),
        Declaration::TSInterfaceDeclaration(node) => Declared::Interface(node),
        Declaration::TSEnumDeclaration(node) => Declared::Enum(node),
        Declaration::TSExternalModuleDeclaration(node) => Declared::External(node),
        Declaration::TSNamespaceDeclaration(node) => Declared::Namespace(node),
        Declaration::TSGlobalDeclaration(node) => Declared::Global(node),
        Declaration::TSImportEqualsDeclaration(node) => Declared::ImportEquals(node),
    }
}

pub fn tops<'a>(file: &ParsedFile<'a>) -> Vec<Top<'a>> {
    let mut found = Vec::new();
    for statement in &file.program.body {
        let span = statement.span();
        let (exported, is_default, declared) = match statement {
            Statement::ExportDeclaration(export) => (true, false, declared_of(&export.declaration)),
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(node) => (true, true, Declared::Function(node)),
                ExportDefaultDeclarationKind::ClassDeclaration(node) => (true, true, Declared::Class(node)),
                ExportDefaultDeclarationKind::TSInterfaceDeclaration(node) => (true, true, Declared::Interface(node)),
                _ => continue,
            },
            Statement::TSNamespaceExportDeclaration(node) => (false, false, Declared::NamespaceExport(node)),
            other => match other.as_declaration() {
                Some(declaration) => (false, false, declared_of(declaration)),
                None => continue,
            },
        };
        let decorated = match &declared {
            Declared::Class(class) => class.decorators.first().map(|decorator| decorator.span.start),
            _ => None,
        };
        found.push(Top { span: (decorated.map_or(span.start, |start| start.min(span.start)), span.end), exported, is_default, declared });
    }
    found
}

fn is_literal(expression: &Expression) -> bool {
    match expression {
        Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BigIntLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::RegExpLiteral(_) => true,
        Expression::TemplateLiteral(template) => template.expressions.is_empty(),
        Expression::UnaryExpression(unary) => {
            matches!(unary.operator, UnaryOperator::UnaryPlus | UnaryOperator::UnaryNegation | UnaryOperator::BitwiseNot | UnaryOperator::LogicalNot)
                && is_literal(&unary.argument)
        }
        Expression::ArrayExpression(array) => array.elements.iter().all(|element| match element {
            ArrayExpressionElement::SpreadElement(_) | ArrayExpressionElement::Elision(_) => false,
            other => is_literal(other.to_expression()),
        }),
        Expression::ObjectExpression(object) => object.properties.iter().all(|property| match property {
            ObjectPropertyKind::ObjectProperty(property) => {
                let simple = !property.computed
                    && matches!(property.key, PropertyKey::StaticIdentifier(_) | PropertyKey::StringLiteral(_) | PropertyKey::NumericLiteral(_));
                simple && !property.shorthand && !property.method && property.kind == PropertyKind::Init && is_literal(&property.value)
            }
            ObjectPropertyKind::SpreadProperty(_) => false,
        }),
        Expression::TSAsExpression(cast) => is_literal(&cast.expression),
        Expression::TSSatisfiesExpression(cast) => is_literal(&cast.expression),
        Expression::TSTypeAssertion(cast) => is_literal(&cast.expression),
        Expression::ParenthesizedExpression(wrapped) => is_literal(&wrapped.expression),
        _ => false,
    }
}

fn wrapper_name<'e>(callee: &'e Expression) -> Option<&'e str> {
    match callee {
        Expression::Identifier(name) => Some(name.name.as_str()),
        Expression::StaticMemberExpression(member) => Some(member.property.name.as_str()),
        _ => None,
    }
}

/// A function, or a function wrapped in `memo` or `forwardRef`.
fn is_component(expression: &Expression) -> bool {
    let mut current = expression;
    loop {
        let call = match current {
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => return true,
            Expression::CallExpression(call) => &**call,
            Expression::ChainExpression(chain) => match &chain.expression {
                ChainElement::CallExpression(call) => &**call,
                _ => return false,
            },
            _ => return false,
        };
        if !wrapper_name(&call.callee).is_some_and(|name| name == "memo" || name == "forwardRef") {
            return false;
        }
        match call.arguments.first().and_then(|argument| argument.as_expression()) {
            Some(first) => current = first,
            None => return false,
        }
    }
}

fn function_tag(form: &str, is_async: bool, generator: bool) -> String {
    format!("{form}{}{}", if is_async { ":async" } else { "" }, if generator { ":gen" } else { "" })
}

/// Drops the separators that do not change meaning: every `;`, and a `,` right before a closing bracket.
pub fn normalized(texts: Vec<String>) -> Vec<String> {
    let kept: Vec<String> = texts.into_iter().filter(|text| text != ";").collect();
    let closes = |text: Option<&String>| text.is_some_and(|text| matches!(text.as_str(), ")" | "]" | "}" | ">"));
    let drop: Vec<bool> = (0..kept.len()).map(|index| kept[index] == "," && closes(kept.get(index + 1))).collect();
    kept.into_iter().zip(drop).filter(|(_, drop)| !drop).map(|(text, _)| text).collect()
}

pub fn hash(halves: Halves, text: &str) -> String {
    Sha256::digest(halves.encoded(text).as_bytes()).iter().take(12).map(|byte| format!("{byte:02x}")).collect()
}

struct Spec<'a> {
    name: String,
    kind: &'static str,
    tag: String,
    parts: Parts,
    literal: bool,
    component: bool,
    top: &'a Top<'a>,
}

pub struct Reader<'t, 'a> {
    pub file: &'t ParsedFile<'a>,
    pub texts: &'t TokenTexts<'t, 'a>,
    pub names: &'t Names<'a>,
    pub type_only: &'t TypeOnly,
}

struct Lookup<'t, 'a> {
    imports: HashMap<String, (String, String)>,
    statements: HashMap<String, usize>,
    tops: &'t [Top<'a>],
    hashed: RefCell<HashMap<usize, String>>,
}

impl<'t, 'a> Reader<'t, 'a> {
    fn typed_texts(&self, spans: &[Span]) -> Vec<String> {
        let mut sorted = spans.to_vec();
        sorted.sort_unstable();
        let mut texts = Vec::new();
        for (start, end) in sorted {
            self.texts.within(start, end, |_| true, &mut texts);
        }
        texts
    }

    fn untyped_texts(&self, spans: &[Span]) -> Vec<String> {
        let mut sorted = spans.to_vec();
        sorted.sort_unstable();
        let mut texts = Vec::new();
        for (start, end) in sorted {
            let erased = self.type_only.inside((start, end));
            let keep = |token: &oxc_parser::Token| {
                let at = token.start();
                let before = erased.partition_point(|(from, _)| *from <= at);
                !self.type_only.token(at) && !(before > 0 && at < erased[before - 1].1)
            };
            self.texts.within(start, end, keep, &mut texts);
        }
        texts
    }

    fn statement_names(&self, top: &Top<'a>) -> Vec<String> {
        match &top.declared {
            Declared::Variable(variable) => variable
                .declarations
                .iter()
                .flat_map(|declarator| {
                    let span = declarator.id.span();
                    self.names.declared_in((span.start, span.end)).map(str::to_string).collect::<Vec<_>>()
                })
                .collect(),
            Declared::Function(node) => node.id.iter().map(|id| id.name.to_string()).collect(),
            Declared::Class(node) => node.id.iter().map(|id| id.name.to_string()).collect(),
            Declared::Interface(node) => vec![node.id.name.to_string()],
            Declared::Alias(node) => vec![node.id.name.to_string()],
            Declared::Enum(node) => vec![node.id.name.to_string()],
            Declared::Namespace(node) => vec![node.id.name.to_string()],
            Declared::External(node) => vec![self.file.halves.string(node.id.value)],
            Declared::Global(_) => vec!["global".to_string()],
            Declared::ImportEquals(node) => vec![node.id.name.to_string()],
            Declared::NamespaceExport(node) => vec![node.id.name.to_string()],
        }
    }

    /// The name and parts of a statement, which stand for it when another definition reads its name.
    fn statement_spans(&self, top: &Top<'a>) -> Vec<Span> {
        let of = |node: &dyn GetSpan| (node.span().start, node.span().end);
        let mut parts = Parts::default();
        let name = match &top.declared {
            Declared::Variable(variable) => return variable.declarations.iter().map(|declarator| of(declarator)).collect(),
            Declared::Function(node) => {
                parts.function(node);
                node.id.as_ref().map(|id| of(id))
            }
            Declared::Class(node) => {
                parts.class(self.file.tokens, node);
                node.id.as_ref().map(|id| of(id))
            }
            Declared::Interface(node) => {
                parts.interface(self.file.tokens, node);
                Some(of(&node.id))
            }
            Declared::Alias(node) => {
                parts.alias(node);
                Some(of(&node.id))
            }
            Declared::Enum(node) => {
                parts.enumeration(node);
                Some(of(&node.id))
            }
            Declared::Namespace(node) => {
                parts.typed.push(match &node.body {
                    TSNamespaceDeclarationBody::TSNamespaceDeclaration(inner) => of(&**inner),
                    TSNamespaceDeclarationBody::TSModuleBlock(block) => of(&**block),
                });
                Some(of(&node.id))
            }
            Declared::External(node) => {
                parts.typed.extend(node.body.as_ref().map(|block| of(&**block)));
                Some(of(&node.id))
            }
            Declared::Global(node) => {
                parts.typed.push(of(&node.body));
                Some((node.global_span.start, node.global_span.end))
            }
            Declared::ImportEquals(node) => Some(of(&node.id)),
            Declared::NamespaceExport(node) => Some(of(&node.id)),
        };
        parts.typed.extend(name);
        parts.typed
    }

    fn lookup(&self, tops: &'t [Top<'a>]) -> Lookup<'t, 'a> {
        let mut imports = HashMap::new();
        for import in super::modules::imports(self.file) {
            let specifier = import.specifier;
            if let Some(local) = import.default_name {
                imports.insert(local, (specifier.clone(), "default".to_string()));
            }
            if let Some(local) = import.namespace_name {
                imports.insert(local, (specifier.clone(), "*".to_string()));
            }
            for named in import.named {
                imports.insert(named.local, (specifier.clone(), named.imported));
            }
        }
        let mut statements = HashMap::new();
        for (index, top) in tops.iter().enumerate() {
            for name in self.statement_names(top) {
                statements.insert(name, index);
            }
        }
        Lookup { imports, statements, tops, hashed: RefCell::new(HashMap::new()) }
    }

    fn binding(&self, lookup: &Lookup<'t, 'a>, name: &str) -> Option<Binding> {
        if let Some((specifier, imported)) = lookup.imports.get(name) {
            return Some(Binding::Import { specifier: specifier.clone(), imported: imported.clone() });
        }
        let index = *lookup.statements.get(name)?;
        let text = lookup
            .hashed
            .borrow_mut()
            .entry(index)
            .or_insert_with(|| hash(self.file.halves, &normalized(self.typed_texts(&self.statement_spans(&lookup.tops[index]))).join(" ")))
            .clone();
        Some(Binding::Local { text })
    }

    fn variable_specs(&self, top: &'t Top<'a>, variable: &'a VariableDeclaration<'a>, specs: &mut Vec<Spec<'t>>)
    where
        'a: 't,
    {
        if !matches!(variable.kind, VariableDeclarationKind::Const | VariableDeclarationKind::AwaitUsing) {
            return;
        }
        for declarator in &variable.declarations {
            let (BindingPattern::BindingIdentifier(id), Some(initializer)) = (&declarator.id, &declarator.init) else { continue };
            let name = self.file.slice(id.span.start, id.span.end).to_string();
            let mut parts = Parts::default();
            parts.annotation(declarator.type_annotation.as_deref());
            let function = match initializer {
                Expression::ArrowFunctionExpression(arrow) => {
                    parts.arrow(arrow);
                    Some(function_tag("arrow", arrow.r#async, false))
                }
                Expression::FunctionExpression(function) => {
                    parts.function(function);
                    Some(function_tag("function", function.r#async, function.generator))
                }
                _ => None,
            };
            specs.push(match function {
                Some(tag) => Spec { name, kind: "function", tag, parts, literal: false, component: true, top },
                None => {
                    let span = initializer.span();
                    parts.typed.push((span.start, span.end));
                    parts.untyped.push((span.start, span.end));
                    let (literal, component) = (is_literal(initializer), is_component(initializer));
                    Spec { name, kind: "const", tag: "const".to_string(), parts, literal, component, top }
                }
            });
        }
    }

    fn specs(&self, tops: &'t [Top<'a>]) -> Vec<Spec<'t>>
    where
        'a: 't,
    {
        let mut specs = Vec::new();
        let mut overloads: HashMap<&str, Vec<&Function<'a>>> = HashMap::new();
        for top in tops {
            if let Declared::Function(function) = &top.declared {
                if let (None, Some(id)) = (&function.body, &function.id) {
                    overloads.entry(id.name.as_str()).or_default().push(function);
                }
            }
        }
        for top in tops {
            let mut parts = Parts::default();
            let (name, kind, tag, component) = match &top.declared {
                Declared::Variable(variable) => {
                    self.variable_specs(top, variable, &mut specs);
                    continue;
                }
                Declared::Function(function) => {
                    let (Some(id), Some(_)) = (&function.id, &function.body) else { continue };
                    for overload in overloads.get(id.name.as_str()).into_iter().flatten() {
                        parts.function(overload);
                    }
                    parts.untyped.clear();
                    parts.function(function);
                    (id.name.to_string(), "function", function_tag("function", function.r#async, function.generator), true)
                }
                Declared::Class(class) => {
                    let Some(id) = &class.id else { continue };
                    parts.class(self.file.tokens, class);
                    (id.name.to_string(), "class", "class".to_string(), false)
                }
                Declared::Interface(interface) => {
                    parts.interface(self.file.tokens, interface);
                    (interface.id.name.to_string(), "interface", "interface".to_string(), false)
                }
                Declared::Enum(declaration) => {
                    parts.enumeration(declaration);
                    (declaration.id.name.to_string(), "enum", "enum".to_string(), false)
                }
                Declared::Alias(alias) => {
                    parts.alias(alias);
                    (alias.id.name.to_string(), "type", "type".to_string(), false)
                }
                _ => continue,
            };
            specs.push(Spec { name, kind, tag, parts, literal: false, component, top });
        }
        specs
    }

    pub fn definitions(&self) -> Vec<Definition> {
        let tops = tops(self.file);
        let lookup = self.lookup(&tops);
        let specs = self.specs(&tops);
        specs
            .into_iter()
            .map(|spec| {
                let texts = self.typed_texts(&spec.parts.typed);
                let size = texts.len();
                let tokens = normalized(texts);
                let free = self
                    .names
                    .free(&spec.parts.typed)
                    .into_iter()
                    .filter_map(|name| self.binding(&lookup, name).map(|binding| Free { name: name.to_string(), binding }))
                    .collect();
                let (start, end) = spec.top.span;
                let line = self.file.lines.line(start);
                Definition {
                    text: format!("{}|{}", spec.tag, tokens.join(" ")),
                    tokens,
                    untyped_tokens: normalized(self.untyped_texts(&spec.parts.untyped)),
                    free,
                    size,
                    exported: spec.top.exported,
                    is_default: spec.top.is_default,
                    literal: spec.literal,
                    component: spec.component,
                    line,
                    lines: self.file.lines.line(end) - line + 1,
                    used_locally: self.names.read_outside(&spec.name, (start, end)),
                    name: spec.name,
                    kind: spec.kind,
                }
            })
            .collect()
    }
}
