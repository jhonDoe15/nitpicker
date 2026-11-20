//! Language-neutral trees of function bodies for the near-duplicate rules, shaped as the Node analyzer builds
//! them from the compiler's tree: same node kinds, same values, same line ranges.
use super::references::Span;
use crate::typescript::ParsedFile;
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_syntax::number::ToJsString;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Clone, Debug, Default)]
pub struct TreeNode {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub literal: Option<&'static str>,
    pub children: Vec<TreeNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binding: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

const SNIPPET_LENGTH: usize = 60;
const SNIPPET_KINDS: &[&str] = &["call", "new", "member", "index", "binary", "unary", "update", "assign", "conditional", "lambda", "expression"];

/// What a JavaScript regular expression matches with `\s`.
pub fn is_space(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}'
            | '\u{3000}' | '\u{feff}'
    )
}

pub fn flat(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut spaced = false;
    for character in text.chars() {
        if is_space(character) {
            if !spaced {
                out.push(' ');
            }
            spaced = true;
        } else {
            out.push(character);
            spaced = false;
        }
    }
    out
}

fn short(text: &str) -> String {
    if text.encode_utf16().count() <= SNIPPET_LENGTH {
        return text.to_string();
    }
    let mut out = String::new();
    let mut units = 0;
    for character in text.chars() {
        units += character.len_utf16();
        if units > SNIPPET_LENGTH - 3 {
            break;
        }
        out.push(character);
    }
    out.push_str("...");
    out
}

pub fn quoted(text: &str) -> String {
    serde_json::to_string(text).expect("string")
}

fn sp(node: &impl GetSpan) -> Span {
    let span = node.span();
    (span.start, span.end)
}

pub fn none() -> TreeNode {
    TreeNode { kind: "none", ..TreeNode::default() }
}

pub enum Lambda<'a> {
    Function(&'a Function<'a>),
    Arrow(&'a ArrowFunctionExpression<'a>),
}

impl Lambda<'_> {
    pub fn modifiers(&self) -> Option<String> {
        let (is_async, generator) = match self {
            Lambda::Function(function) => (function.r#async, function.generator),
            Lambda::Arrow(arrow) => (arrow.r#async, false),
        };
        let text = format!("{}{}", if is_async { "async" } else { "" }, if generator { "*" } else { "" });
        (!text.is_empty()).then_some(text)
    }
}

pub struct Trees<'t, 'a> {
    pub file: &'t ParsedFile<'a>,
    pub bound: HashSet<&'a str>,
    pub imported: &'t HashMap<String, String>,
}

impl<'t, 'a> Trees<'t, 'a> {
    pub fn at(&self, kind: &'static str, span: Span, children: Vec<TreeNode>) -> TreeNode {
        let lines = &self.file.lines;
        TreeNode { kind, children, start: Some(lines.line(span.0)), end: Some(lines.line(span.1)), ..TreeNode::default() }
    }
    pub fn valued(&self, kind: &'static str, value: impl Into<String>, span: Span, children: Vec<TreeNode>) -> TreeNode {
        TreeNode { value: Some(value.into()), ..self.at(kind, span, children) }
    }
    fn grouped(&self, value: impl Into<String>, span: Span, children: Vec<TreeNode>) -> TreeNode {
        self.valued("expression", value, span, children)
    }
    fn literal(&self, literal: &'static str, value: impl Into<String>, span: Span) -> TreeNode {
        TreeNode { literal: Some(literal), ..self.valued("literal", value, span, Vec::new()) }
    }
    fn text(&self, span: Span) -> String {
        flat(self.file.slice(span.0, span.1))
    }
    fn snippet(&self, mut node: TreeNode, span: Span) -> TreeNode {
        if node.text.is_none() && SNIPPET_KINDS.contains(&node.kind) {
            node.text = Some(short(&self.text(span)));
        }
        node
    }
    fn name(&self, text: &str, span: Span) -> TreeNode {
        let (binding, value) = if self.bound.contains(text) {
            ("bound", text.to_string())
        } else {
            ("free", self.imported.get(text).cloned().unwrap_or_else(|| text.to_string()))
        };
        TreeNode { binding: Some(binding), text: Some(text.to_string()), ..self.valued("name", value, span, Vec::new()) }
    }
    fn opaque(&self, kind: &'static str, syntax: &str, span: Span) -> TreeNode {
        self.valued(kind, format!("{syntax}:{}", self.text(span)), span, Vec::new())
    }
    pub fn type_of(&self, annotation: Option<&TSTypeAnnotation<'a>>) -> TreeNode {
        match annotation {
            Some(annotation) => {
                let span = sp(&annotation.type_annotation);
                self.valued("type", self.text(span), span, Vec::new())
            }
            None => none(),
        }
    }

    fn key(&self, key: &PropertyKey<'a>) -> Option<String> {
        match key {
            PropertyKey::StaticIdentifier(name) => Some(name.name.to_string()),
            PropertyKey::PrivateIdentifier(name) => Some(format!("#{}", name.name)),
            PropertyKey::StringLiteral(literal) => Some(literal.value.display().to_string()),
            PropertyKey::TemplateLiteral(template) if template.expressions.is_empty() => {
                Some(template.quasis.first().and_then(|quasi| quasi.value.cooked).map(|text| text.display().to_string()).unwrap_or_default())
            }
            PropertyKey::NumericLiteral(number) => Some(number.value.to_js_string()),
            _ => None,
        }
    }

    fn member(&self, prefix: &str, key: &PropertyKey<'a>, computed: bool, span: Span, body: TreeNode) -> TreeNode {
        let node = match (computed, key.as_expression()) {
            (true, Some(expression)) => self.grouped(format!("{prefix}-computed"), span, vec![self.expression(expression), body]),
            _ => self.grouped(format!("{prefix}:{}", self.key(key).unwrap_or_else(|| "undefined".to_string())), span, vec![body]),
        };
        self.snippet(node, span)
    }

    fn template_part(&self, template: &TemplateLiteral<'a>, index: usize) -> TreeNode {
        let quasi = &template.quasis[index];
        let start = if index == 0 { template.span.start } else { quasi.span.start };
        let cooked = quasi.value.cooked.map(|text| text.display().to_string()).unwrap_or_default();
        self.literal("string", quoted(&cooked), (start, quasi.span.end))
    }

    fn template(&self, template: &TemplateLiteral<'a>) -> TreeNode {
        let span = sp(template);
        if template.expressions.is_empty() {
            let cooked = template.quasis.first().and_then(|quasi| quasi.value.cooked).map(|text| text.display().to_string()).unwrap_or_default();
            return self.literal("string", quoted(&cooked), span);
        }
        let mut children = vec![self.template_part(template, 0)];
        for (index, expression) in template.expressions.iter().enumerate() {
            children.push(self.expression(expression));
            if index + 1 < template.quasis.len() {
                children.push(self.template_part(template, index + 1));
            }
        }
        self.snippet(self.grouped("template", span, children), span)
    }

    fn arguments(&self, arguments: &[Argument<'a>]) -> Vec<TreeNode> {
        arguments
            .iter()
            .map(|argument| match argument {
                Argument::SpreadElement(spread) => self.spread(sp(&**spread), self.expression(&spread.argument)),
                other => self.expression(other.to_expression()),
            })
            .collect()
    }

    fn spread(&self, span: Span, inner: TreeNode) -> TreeNode {
        self.snippet(self.grouped("spread", span, vec![inner]), span)
    }

    fn static_member(&self, member: &StaticMemberExpression<'a>) -> TreeNode {
        let span = sp(member);
        let value = format!("{}{}", if member.optional { "?." } else { "" }, member.property.name);
        self.snippet(self.valued("member", value, span, vec![self.expression(&member.object)]), span)
    }
    fn private_member(&self, member: &PrivateFieldExpression<'a>) -> TreeNode {
        let span = sp(member);
        let value = format!("{}#{}", if member.optional { "?." } else { "" }, member.field.name);
        self.snippet(self.valued("member", value, span, vec![self.expression(&member.object)]), span)
    }
    fn computed_member(&self, member: &ComputedMemberExpression<'a>) -> TreeNode {
        let span = sp(member);
        let children = vec![self.expression(&member.object), self.expression(&member.expression)];
        let node = if member.optional { self.grouped("optional-index", span, children) } else { self.at("index", span, children) };
        self.snippet(node, span)
    }
    fn call(&self, call: &CallExpression<'a>) -> TreeNode {
        let span = sp(call);
        let mut children = vec![self.expression(&call.callee)];
        children.extend(self.arguments(&call.arguments));
        let node = if call.optional { self.grouped("optional-call", span, children) } else { self.at("call", span, children) };
        self.snippet(node, span)
    }
    /// A node the compiler keeps only for its type syntax or parentheses: the tree shows what it wraps.
    fn wrapped(&self, inner: &Expression<'a>, span: Span) -> TreeNode {
        self.snippet(self.expression(inner), span)
    }

    fn object_property(&self, property: &ObjectProperty<'a>) -> TreeNode {
        let span = sp(property);
        if property.shorthand {
            let name = self.key(&property.key).unwrap_or_default();
            let node = self.grouped(format!("property:{name}"), span, vec![self.name(&name, sp(&property.key))]);
            return self.snippet(node, span);
        }
        let function = match &property.value {
            Expression::FunctionExpression(function) if property.method || property.kind != PropertyKind::Init => Some(&**function),
            _ => None,
        };
        match function {
            Some(function) => {
                let prefix = match property.kind {
                    PropertyKind::Get => "get",
                    PropertyKind::Set => "set",
                    PropertyKind::Init => "method",
                };
                self.member(prefix, &property.key, property.computed, span, self.lambda(&Lambda::Function(function), span))
            }
            None => self.member("property", &property.key, property.computed, span, self.expression(&property.value)),
        }
    }

    fn maybe_default(&self, target: &AssignmentTargetMaybeDefault<'a>) -> TreeNode {
        match target {
            AssignmentTargetMaybeDefault::AssignmentTargetWithDefault(with) => {
                let span = sp(&**with);
                self.snippet(self.valued("assign", "=", span, vec![self.target(&with.binding), self.expression(&with.init)]), span)
            }
            other => self.target(other.to_assignment_target()),
        }
    }

    fn target(&self, target: &AssignmentTarget<'a>) -> TreeNode {
        match target {
            AssignmentTarget::AssignmentTargetIdentifier(name) => self.name(&name.name, sp(&**name)),
            AssignmentTarget::StaticMemberExpression(member) => self.static_member(member),
            AssignmentTarget::PrivateFieldExpression(member) => self.private_member(member),
            AssignmentTarget::ComputedMemberExpression(member) => self.computed_member(member),
            AssignmentTarget::TSAsExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            AssignmentTarget::TSSatisfiesExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            AssignmentTarget::TSNonNullExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            AssignmentTarget::TSTypeAssertion(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            AssignmentTarget::ArrayAssignmentTarget(array) => {
                let span = sp(&**array);
                let mut children: Vec<TreeNode> =
                    array.elements.iter().map(|element| element.as_ref().map_or_else(none, |element| self.maybe_default(element))).collect();
                children.extend(array.rest.as_ref().map(|rest| self.spread(sp(&**rest), self.target(&rest.target))));
                self.snippet(self.grouped("array", span, children), span)
            }
            AssignmentTarget::ObjectAssignmentTarget(object) => {
                let span = sp(&**object);
                let mut children: Vec<TreeNode> = object
                    .properties
                    .iter()
                    .map(|property| match property {
                        AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(short) => {
                            let span = sp(&**short);
                            let name = self.name(&short.binding.name, sp(&short.binding));
                            self.snippet(self.grouped(format!("property:{}", short.binding.name), span, vec![name]), span)
                        }
                        AssignmentTargetProperty::AssignmentTargetPropertyProperty(pair) => {
                            self.member("property", &pair.name, pair.computed, sp(&**pair), self.maybe_default(&pair.binding))
                        }
                    })
                    .collect();
                children.extend(object.rest.as_ref().map(|rest| self.spread(sp(&**rest), self.target(&rest.target))));
                self.snippet(self.grouped("object", span, children), span)
            }
        }
    }

    fn simple_target(&self, target: &SimpleAssignmentTarget<'a>) -> TreeNode {
        match target {
            SimpleAssignmentTarget::AssignmentTargetIdentifier(name) => self.name(&name.name, sp(&**name)),
            SimpleAssignmentTarget::StaticMemberExpression(member) => self.static_member(member),
            SimpleAssignmentTarget::PrivateFieldExpression(member) => self.private_member(member),
            SimpleAssignmentTarget::ComputedMemberExpression(member) => self.computed_member(member),
            SimpleAssignmentTarget::TSAsExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            SimpleAssignmentTarget::TSSatisfiesExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            SimpleAssignmentTarget::TSNonNullExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
            SimpleAssignmentTarget::TSTypeAssertion(cast) => self.wrapped(&cast.expression, sp(&**cast)),
        }
    }

    fn jsx_children(&self, children: &[JSXChild<'a>]) -> Vec<TreeNode> {
        let mut out = Vec::new();
        for child in children {
            match child {
                JSXChild::Text(text) => {
                    let span = sp(&**text);
                    let value = flat(self.file.slice(span.0, span.1));
                    let value = value.trim_matches(' ');
                    if !value.is_empty() {
                        let raw = self.file.slice(span.0, span.1);
                        let lead = raw.len() - raw.trim_start_matches(is_space).len();
                        out.push(self.literal("string", quoted(value), (span.0 + lead as u32, span.1)));
                    }
                }
                JSXChild::Element(element) => out.push(self.jsx_element(element)),
                JSXChild::Fragment(fragment) => out.push(self.jsx_fragment(fragment)),
                JSXChild::ExpressionContainer(container) => {
                    if let Some(expression) = container.expression.as_expression() {
                        out.push(self.wrapped(expression, sp(&**container)));
                    }
                }
                JSXChild::Spread(spread) => out.push(self.wrapped(&spread.expression, sp(&**spread))),
            }
        }
        out
    }

    fn jsx_attribute_value(&self, attribute: &JSXAttribute<'a>) -> TreeNode {
        match &attribute.value {
            None => self.literal("boolean", "true", sp(attribute)),
            Some(JSXAttributeValue::StringLiteral(literal)) => self.literal("string", quoted(&literal.value.display().to_string()), sp(&**literal)),
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                container.expression.as_expression().map_or_else(none, |expression| self.expression(expression))
            }
            Some(JSXAttributeValue::Element(element)) => self.jsx_element(element),
            Some(JSXAttributeValue::Fragment(fragment)) => self.jsx_fragment(fragment),
        }
    }

    fn jsx_element(&self, element: &JSXElement<'a>) -> TreeNode {
        let span = sp(element);
        let opening = &element.opening_element;
        let mut children: Vec<TreeNode> = opening
            .attributes
            .iter()
            .map(|item| match item {
                JSXAttributeItem::SpreadAttribute(spread) => self.grouped("spread", sp(&**spread), vec![self.expression(&spread.argument)]),
                JSXAttributeItem::Attribute(attribute) => {
                    let name = self.text(sp(&attribute.name));
                    self.grouped(format!("attribute:{name}"), sp(&**attribute), vec![self.jsx_attribute_value(attribute)])
                }
            })
            .collect();
        children.extend(self.jsx_children(&element.children));
        self.snippet(self.grouped(format!("jsx:{}", self.text(sp(&opening.name))), span, children), span)
    }

    fn jsx_fragment(&self, fragment: &JSXFragment<'a>) -> TreeNode {
        let span = sp(fragment);
        self.snippet(self.grouped("jsx:", span, self.jsx_children(&fragment.children)), span)
    }

    fn sequence(&self, expressions: &[Expression<'a>]) -> TreeNode {
        let first = sp(&expressions[0]);
        let mut node = self.expression(&expressions[0]);
        for next in &expressions[1..] {
            let span = (first.0, next.span().end);
            node = self.snippet(self.grouped("comma", span, vec![node, self.expression(next)]), span);
        }
        node
    }

    pub fn expression(&self, expression: &Expression<'a>) -> TreeNode {
        let span = sp(expression);
        match expression {
            Expression::Identifier(name) => self.name(&name.name, span),
            Expression::StringLiteral(literal) => self.literal("string", quoted(&literal.value.display().to_string()), span),
            Expression::TemplateLiteral(template) => self.template(template),
            Expression::NumericLiteral(number) => self.literal("number", number.value.to_js_string(), span),
            Expression::BigIntLiteral(_) => self.literal("bigint", self.file.slice(span.0, span.1).replace('_', ""), span),
            Expression::RegExpLiteral(_) => self.literal("regexp", self.file.slice(span.0, span.1), span),
            Expression::BooleanLiteral(literal) => self.literal("boolean", if literal.value { "true" } else { "false" }, span),
            Expression::NullLiteral(_) => self.literal("null", "null", span),
            Expression::ThisExpression(_) => self.at("this", span, Vec::new()),
            Expression::Super(_) => self.name("super", span),
            Expression::NewTarget(_) | Expression::ImportMeta(_) => self.name(&self.text(span), span),
            Expression::BinaryExpression(binary) => {
                let children = vec![self.expression(&binary.left), self.expression(&binary.right)];
                self.snippet(self.valued("binary", binary.operator.as_str(), span, children), span)
            }
            Expression::LogicalExpression(logical) => {
                let children = vec![self.expression(&logical.left), self.expression(&logical.right)];
                self.snippet(self.valued("binary", logical.operator.as_str(), span, children), span)
            }
            Expression::PrivateInExpression(private) => {
                let children = vec![self.opaque("expression", "PrivateIdentifier", sp(&private.left)), self.expression(&private.right)];
                self.snippet(self.valued("binary", "in", span, children), span)
            }
            Expression::AssignmentExpression(assignment) => {
                let children = vec![self.target(&assignment.left), self.expression(&assignment.right)];
                self.snippet(self.valued("assign", assignment.operator.as_str(), span, children), span)
            }
            Expression::SequenceExpression(sequence) => self.sequence(&sequence.expressions),
            Expression::UnaryExpression(unary) => {
                self.snippet(self.valued("unary", unary.operator.as_str(), span, vec![self.expression(&unary.argument)]), span)
            }
            Expression::AwaitExpression(awaited) => self.snippet(self.valued("unary", "await", span, vec![self.expression(&awaited.argument)]), span),
            Expression::UpdateExpression(update) => {
                let value = format!("{}{}", if update.prefix { "prefix" } else { "postfix" }, update.operator.as_str());
                self.snippet(self.valued("update", value, span, vec![self.simple_target(&update.argument)]), span)
            }
            Expression::ConditionalExpression(conditional) => {
                let children =
                    vec![self.expression(&conditional.test), self.expression(&conditional.consequent), self.expression(&conditional.alternate)];
                self.snippet(self.at("conditional", span, children), span)
            }
            Expression::CallExpression(call) => self.call(call),
            Expression::ImportExpression(import) => {
                let mut children = vec![self.name("import", (span.0, span.0 + 6)), self.expression(&import.source)];
                children.extend(import.options.as_ref().map(|options| self.expression(options)));
                self.snippet(self.at("call", span, children), span)
            }
            Expression::NewExpression(new) => {
                let callee = sp(&new.callee);
                let mut children = vec![self.valued("type", self.text(callee), callee, Vec::new())];
                children.extend(self.arguments(&new.arguments));
                self.snippet(self.at("new", span, children), span)
            }
            Expression::StaticMemberExpression(member) => self.static_member(member),
            Expression::PrivateFieldExpression(member) => self.private_member(member),
            Expression::ComputedMemberExpression(member) => self.computed_member(member),
            Expression::ChainExpression(chain) => match &chain.expression {
                ChainElement::CallExpression(call) => self.call(call),
                ChainElement::TSNonNullExpression(cast) => self.wrapped(&cast.expression, sp(&**cast)),
                ChainElement::StaticMemberExpression(member) => self.static_member(member),
                ChainElement::PrivateFieldExpression(member) => self.private_member(member),
                ChainElement::ComputedMemberExpression(member) => self.computed_member(member),
            },
            Expression::ParenthesizedExpression(wrapped) => self.wrapped(&wrapped.expression, span),
            Expression::TSAsExpression(cast) => self.wrapped(&cast.expression, span),
            Expression::TSSatisfiesExpression(cast) => self.wrapped(&cast.expression, span),
            Expression::TSTypeAssertion(cast) => self.wrapped(&cast.expression, span),
            Expression::TSNonNullExpression(cast) => self.wrapped(&cast.expression, span),
            Expression::TSInstantiationExpression(cast) => self.wrapped(&cast.expression, span),
            Expression::ArrowFunctionExpression(arrow) => self.snippet(self.lambda(&Lambda::Arrow(arrow), span), span),
            Expression::FunctionExpression(function) => self.snippet(self.lambda(&Lambda::Function(function), span), span),
            Expression::YieldExpression(yielded) => {
                let child = yielded.argument.as_ref().map_or_else(none, |argument| self.expression(argument));
                self.snippet(self.grouped(if yielded.delegate { "yield*" } else { "yield" }, span, vec![child]), span)
            }
            Expression::ClassExpression(class) => {
                let span = (class.decorators.first().map_or(span.0, |decorator| decorator.span.start.min(span.0)), span.1);
                self.snippet(self.opaque("expression", "ClassExpression", span), span)
            }
            Expression::ObjectExpression(object) => {
                let children = object
                    .properties
                    .iter()
                    .map(|property| match property {
                        ObjectPropertyKind::ObjectProperty(property) => self.object_property(property),
                        ObjectPropertyKind::SpreadProperty(spread) => self.spread(sp(&**spread), self.expression(&spread.argument)),
                    })
                    .collect();
                self.snippet(self.grouped("object", span, children), span)
            }
            Expression::ArrayExpression(array) => {
                let children = array
                    .elements
                    .iter()
                    .map(|element| match element {
                        ArrayExpressionElement::SpreadElement(spread) => self.spread(sp(&**spread), self.expression(&spread.argument)),
                        ArrayExpressionElement::Elision(_) => none(),
                        other => self.expression(other.to_expression()),
                    })
                    .collect();
                self.snippet(self.grouped("array", span, children), span)
            }
            Expression::TaggedTemplateExpression(tagged) => {
                let children = vec![self.expression(&tagged.tag), self.template(&tagged.quasi)];
                self.snippet(self.grouped("tagged", span, children), span)
            }
            Expression::JSXElement(element) => self.jsx_element(element),
            Expression::JSXFragment(fragment) => self.jsx_fragment(fragment),
            _ => self.opaque("expression", "Unknown", span),
        }
    }

    fn binding_element(&self, key: String, span: Span, value: &BindingPattern<'a>) -> TreeNode {
        let children = match value {
            BindingPattern::AssignmentPattern(with) => vec![self.pattern(&with.left), self.expression(&with.right)],
            other => vec![self.pattern(other), none()],
        };
        self.snippet(self.grouped(format!("binding:{key}"), span, children), span)
    }

    fn rest_element(&self, rest: &BindingRestElement<'a>) -> TreeNode {
        let span = sp(rest);
        self.snippet(self.grouped("binding:...", span, vec![self.pattern(&rest.argument), none()]), span)
    }

    pub fn pattern(&self, pattern: &BindingPattern<'a>) -> TreeNode {
        let span = sp(pattern);
        match pattern {
            BindingPattern::BindingIdentifier(name) => self.name(&name.name, span),
            BindingPattern::ObjectPattern(object) => {
                let mut children: Vec<TreeNode> = object
                    .properties
                    .iter()
                    .map(|property| {
                        let key = match (property.shorthand, property.computed) {
                            (true, _) => String::new(),
                            (false, true) => "[]".to_string(),
                            (false, false) => self.key(&property.key).unwrap_or_else(|| "[]".to_string()),
                        };
                        self.binding_element(key, sp(property), &property.value)
                    })
                    .collect();
                children.extend(object.rest.as_ref().map(|rest| self.rest_element(rest)));
                self.snippet(self.grouped("object-pattern", span, children), span)
            }
            BindingPattern::ArrayPattern(array) => {
                let mut children: Vec<TreeNode> = array
                    .elements
                    .iter()
                    .map(|element| element.as_ref().map_or_else(none, |element| self.binding_element(String::new(), sp(element), element)))
                    .collect();
                children.extend(array.rest.as_ref().map(|rest| self.rest_element(rest)));
                self.snippet(self.grouped("array-pattern", span, children), span)
            }
            BindingPattern::AssignmentPattern(with) => self.pattern(&with.left),
        }
    }

    fn parameters(&self, this: Option<&TSThisParameter<'a>>, parameters: &FormalParameters<'a>, span: Span) -> TreeNode {
        let mut children = Vec::new();
        if let Some(this) = this {
            let name = self.name("this", (this.this_span.start, this.this_span.end));
            children.push(self.at("parameter", sp(this), vec![self.type_of(this.type_annotation.as_deref()), name]));
        }
        for parameter in &parameters.items {
            let own = sp(parameter);
            let name = self.pattern(&parameter.pattern);
            let target = match &parameter.initializer {
                Some(initializer) => self.grouped("default", own, vec![name, self.expression(initializer)]),
                None => name,
            };
            children.push(self.at("parameter", own, vec![self.type_of(parameter.type_annotation.as_deref()), target]));
        }
        if let Some(rest) = &parameters.rest {
            let own = sp(&**rest);
            let target = self.grouped("rest", own, vec![self.pattern(&rest.rest.argument)]);
            children.push(self.at("parameter", own, vec![self.type_of(rest.type_annotation.as_deref()), target]));
        }
        self.at("parameters", span, children)
    }

    fn body(&self, body: &FunctionBody<'a>) -> TreeNode {
        let mut children: Vec<TreeNode> = body
            .directives
            .iter()
            .map(|directive| {
                let literal = &directive.expression;
                let value = self.literal("string", quoted(&literal.value.display().to_string()), sp(literal));
                self.at("evaluate", sp(directive), vec![value])
            })
            .collect();
        self.list(&body.statements, &mut children);
        self.at("block", sp(body), children)
    }

    /// The parameters and the body of a function, which with its return type make up a unit.
    pub fn lambda_parts(&self, lambda: &Lambda<'a>, span: Span) -> Vec<TreeNode> {
        match lambda {
            Lambda::Function(function) => {
                let mut parts = vec![self.parameters(function.this_param.as_deref(), &function.params, span)];
                parts.extend(function.body.as_ref().map(|body| self.body(body)));
                parts
            }
            Lambda::Arrow(arrow) => {
                let body = match &arrow.body {
                    ArrowFunctionBody::FunctionBody(body) => self.body(body),
                    other => {
                        let expression = other.to_expression();
                        let own = sp(expression);
                        self.at("block", own, vec![self.at("return", own, vec![self.expression(expression)])])
                    }
                };
                vec![self.parameters(None, &arrow.params, span), body]
            }
        }
    }

    fn lambda(&self, lambda: &Lambda<'a>, span: Span) -> TreeNode {
        TreeNode { value: lambda.modifiers(), ..self.at("lambda", span, self.lambda_parts(lambda, span)) }
    }

    fn declarations(&self, declaration: &VariableDeclaration<'a>, out: &mut Vec<TreeNode>) {
        for declarator in &declaration.declarations {
            let initializer = declarator.init.as_ref().map_or_else(none, |initializer| self.expression(initializer));
            let children = vec![self.type_of(declarator.type_annotation.as_deref()), self.pattern(&declarator.id), initializer];
            out.push(self.at("declare", sp(declarator), children));
        }
    }

    fn list(&self, statements: &[Statement<'a>], out: &mut Vec<TreeNode>) {
        for statement in statements {
            self.statement(statement, out);
        }
    }

    fn block_of(&self, statement: &Statement<'a>) -> TreeNode {
        let mut children = Vec::new();
        self.statement(statement, &mut children);
        match statement {
            Statement::BlockStatement(_) => children.pop().unwrap_or_else(none),
            _ => self.at("block", sp(statement), children),
        }
    }

    fn block(&self, block: &BlockStatement<'a>) -> TreeNode {
        let mut children = Vec::new();
        self.list(&block.body, &mut children);
        self.at("block", sp(block), children)
    }

    fn labelled(&self, kind: &'static str, label: Option<&LabelIdentifier<'a>>, span: Span) -> TreeNode {
        TreeNode { value: label.map(|label| label.name.to_string()), ..self.at(kind, span, Vec::new()) }
    }

    fn opaque_statement(&self, syntax: &str, span: Span, out: &mut Vec<TreeNode>) {
        out.push(self.opaque("statement", syntax, span));
    }

    pub fn statement(&self, statement: &Statement<'a>, out: &mut Vec<TreeNode>) {
        let span = sp(statement);
        let grouped = |value: &str, children: Vec<TreeNode>| self.valued("statement", value, span, children);
        match statement {
            Statement::BlockStatement(block) => out.push(self.block(block)),
            Statement::VariableDeclaration(declaration) => self.declarations(declaration, out),
            Statement::ExpressionStatement(evaluated) => out.push(self.at("evaluate", span, vec![self.expression(&evaluated.expression)])),
            Statement::IfStatement(branch) => {
                let otherwise = branch.alternate.as_ref().map_or_else(none, |alternate| self.block_of(alternate));
                out.push(self.at("if", span, vec![self.expression(&branch.test), self.block_of(&branch.consequent), otherwise]));
            }
            Statement::ReturnStatement(returned) => {
                let value = returned.argument.as_ref().map_or_else(none, |argument| self.expression(argument));
                out.push(self.at("return", span, vec![value]));
            }
            Statement::ThrowStatement(thrown) => out.push(self.at("throw", span, vec![self.expression(&thrown.argument)])),
            Statement::BreakStatement(jump) => out.push(self.labelled("break", jump.label.as_ref(), span)),
            Statement::ContinueStatement(jump) => out.push(self.labelled("continue", jump.label.as_ref(), span)),
            Statement::ForStatement(looped) => {
                let mut first = Vec::new();
                match &looped.init {
                    Some(ForStatementInit::VariableDeclaration(declaration)) => self.declarations(declaration, &mut first),
                    Some(other) => {
                        let expression = other.to_expression();
                        first.push(self.at("evaluate", sp(expression), vec![self.expression(expression)]));
                    }
                    None => {}
                }
                let test = looped.test.as_ref().map_or_else(none, |test| self.expression(test));
                let update: Vec<TreeNode> =
                    looped.update.iter().map(|update| self.at("evaluate", sp(update), vec![self.expression(update)])).collect();
                let children = vec![self.at("block", span, first), test, self.at("block", span, update), self.block_of(&looped.body)];
                out.push(self.at("for", span, children));
            }
            Statement::ForOfStatement(looped) => {
                let target = match &looped.left {
                    ForStatementLeft::VariableDeclaration(declaration) => {
                        declaration.declarations.first().map_or_else(none, |declarator| self.pattern(&declarator.id))
                    }
                    other => self.target(other.to_assignment_target()),
                };
                let parts = vec![target, self.expression(&looped.right), self.block_of(&looped.body)];
                out.push(if looped.r#await {
                    grouped("for-await", parts)
                } else {
                    let mut children = vec![none()];
                    children.extend(parts);
                    self.at("foreach", span, children)
                });
            }
            Statement::ForInStatement(looped) => {
                let mut children = Vec::new();
                match &looped.left {
                    ForStatementLeft::VariableDeclaration(declaration) => self.declarations(declaration, &mut children),
                    other => {
                        let target = other.to_assignment_target();
                        children.push(self.at("evaluate", sp(target), vec![self.target(target)]));
                    }
                }
                children.push(self.expression(&looped.right));
                children.push(self.block_of(&looped.body));
                out.push(grouped("for-in", children));
            }
            Statement::WhileStatement(looped) => out.push(self.at("while", span, vec![self.expression(&looped.test), self.block_of(&looped.body)])),
            Statement::DoWhileStatement(looped) => out.push(self.at("do", span, vec![self.block_of(&looped.body), self.expression(&looped.test)])),
            Statement::SwitchStatement(switch) => {
                let mut children = vec![self.expression(&switch.discriminant)];
                for case in &switch.cases {
                    let own = sp(case);
                    let test = case.test.as_ref().map_or_else(none, |test| self.expression(test));
                    let mut body = Vec::new();
                    self.list(&case.consequent, &mut body);
                    children.push(self.valued("statement", "case", own, vec![test, self.at("block", own, body)]));
                }
                out.push(grouped("switch", children));
            }
            Statement::TryStatement(attempt) => {
                let handler = attempt.handler.as_ref().map_or_else(none, |handler| {
                    let parameter = handler.param.as_ref().map_or_else(none, |parameter| self.pattern(&parameter.pattern));
                    self.valued("statement", "catch", sp(&**handler), vec![parameter, self.block(&handler.body)])
                });
                let finalizer = attempt.finalizer.as_ref().map_or_else(none, |finalizer| self.block(finalizer));
                out.push(grouped("try", vec![self.block(&attempt.block), handler, finalizer]));
            }
            Statement::LabeledStatement(labelled) => out.push(grouped(&format!("label:{}", labelled.label.name), vec![self.block_of(&labelled.body)])),
            Statement::EmptyStatement(_) => {}
            Statement::FunctionDeclaration(function) => {
                if function.body.is_some() {
                    let name = function.id.as_ref().map_or("default", |id| id.name.as_str());
                    let children = vec![none(), self.name(name, span), self.lambda(&Lambda::Function(function), span)];
                    out.push(self.at("declare", span, children));
                }
            }
            Statement::ClassDeclaration(class) => {
                let start = class.decorators.first().map_or(span.0, |decorator| decorator.span.start.min(span.0));
                self.opaque_statement("ClassDeclaration", (start, span.1), out);
            }
            Statement::DebuggerStatement(_) => self.opaque_statement("LastStatement", span, out),
            Statement::WithStatement(_) => self.opaque_statement("WithStatement", span, out),
            Statement::TSTypeAliasDeclaration(_) => self.opaque_statement("TypeAliasDeclaration", span, out),
            Statement::TSInterfaceDeclaration(_) => self.opaque_statement("InterfaceDeclaration", span, out),
            Statement::TSEnumDeclaration(_) => self.opaque_statement("EnumDeclaration", span, out),
            Statement::TSNamespaceDeclaration(_) | Statement::TSExternalModuleDeclaration(_) | Statement::TSGlobalDeclaration(_) => {
                self.opaque_statement("ModuleDeclaration", span, out);
            }
            Statement::TSImportEqualsDeclaration(_) => self.opaque_statement("ImportEqualsDeclaration", span, out),
            Statement::ImportDeclaration(_) => self.opaque_statement("ImportDeclaration", span, out),
            _ => out.push(self.opaque("expression", "Unknown", span)),
        }
    }
}
