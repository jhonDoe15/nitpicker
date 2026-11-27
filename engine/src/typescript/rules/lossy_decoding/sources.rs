//! `decoded-sources.mts` of the ESLint plugin: where bytes become text with silent replacement, a lenient UTF-8
//! `TextDecoder` or a file read as `utf8`.
use crate::typescript::rules::patterns::syntax::callee_name_of;
use crate::typescript::rules::security_values::{defs, member_name, property_named, resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{source, string_value};
use regex::Regex;
use std::sync::LazyLock;

const READ_FILE: [&str; 2] = ["readFile", "readFileSync"];

static UTF8: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^utf-?8$").expect("pattern"));
static TEXT_FILE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\.(?:json|md|ts|js|mjs|yml|yaml|toml|txt|html|css)['"`]$|json|config|manifest"#).expect("pattern"));
static TOOLING_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|/)(?:build|scripts?|tools)/").expect("pattern"));
static BASE64_TEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)base64|atob").expect("pattern"));

#[derive(Clone, PartialEq)]
pub enum Source {
    Decoder,
    File(String),
}

/// `plainName`: the called name of an unwrapped callee.
pub fn plain_name(node: Option<Node>) -> String {
    node.map(unwrapped).and_then(callee_name_of).unwrap_or_default()
}

fn is_text_decoder(node: Option<Node>) -> bool {
    node.is_some_and(|node| {
        let callee = node.node("callee");
        node.is("NewExpression") && callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("TextDecoder"))
    })
}

fn is_lenient_utf8<'s>(scopes: &Scopes<'_, 's>, decoder: Node<'s>) -> bool {
    let arguments = decoder.nodes("arguments");
    let (label, options) = (arguments.first().copied(), arguments.get(1).copied());
    if label.is_some() && !UTF8.is_match(&string_value(label).unwrap_or_default()) {
        return false;
    }
    let Some(options) = options else { return true };
    if !options.is("ObjectExpression") || options.nodes("properties").iter().any(|entry| !entry.is("Property")) {
        return false;
    }
    let fatal = property_named(scopes, Some(options), "fatal");
    fatal.is_none_or(|fatal| fatal.is("Literal") && fatal.get("value") == Value::Bool(false))
}

/// `findVariable(...)?.defs.at(0)?.node`'s initializer, when that node is a declarator.
pub fn initializer_of<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Node<'s>> {
    let node = defs(scopes, identifier).into_iter().next()?.node;
    if node.is("VariableDeclarator") { node.node("init") } else { None }
}

fn decoder_of<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>) -> Option<Node<'s>> {
    let plain = unwrapped(object);
    if is_text_decoder(Some(plain)) {
        return Some(plain);
    }
    if !plain.is("Identifier") {
        return None;
    }
    initializer_of(scopes, plain).filter(|init| is_text_decoder(Some(*init)))
}

fn utf8_encoding<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let plain = resolve_constant(scopes, node);
    if let Some(object) = plain.filter(|plain| plain.is("ObjectExpression")) {
        return UTF8.is_match(&string_value(property_named(scopes, Some(object), "encoding")).unwrap_or_default());
    }
    UTF8.is_match(&string_value(plain).unwrap_or_default())
}

fn buffer_read<'s>(scopes: &Scopes<'_, 's>, text: &str, node: Node<'s>) -> Option<String> {
    let mut current = node;
    loop {
        let plain = unwrapped(current);
        let inner = match plain.node("argument").filter(|_| plain.is("AwaitExpression")) {
            Some(argument) => unwrapped(argument),
            None => plain,
        };
        if inner.is("CallExpression") && READ_FILE.contains(&plain_name(inner.node("callee")).as_str()) {
            let arguments = inner.nodes("arguments");
            let path = arguments.first().copied().filter(|_| arguments.get(1).is_none());
            return path.map(|path| source(text, path).to_string());
        }
        current = if inner.is("Identifier") { initializer_of(scopes, inner)? } else { return None };
    }
}

pub struct Origin<'c> {
    pub text: &'c str,
    pub filename: &'c str,
}

impl Origin<'_> {
    fn is_authored_text(&self, path: &str) -> bool {
        TEXT_FILE.is_match(path) || TOOLING_FILE.is_match(self.filename)
    }

    fn file_source<'s>(&self, scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Source> {
        let arguments = call.nodes("arguments");
        let path = arguments.first().copied().filter(|_| READ_FILE.contains(&plain_name(call.node("callee")).as_str()))?;
        let text = source(self.text, path).to_string();
        (utf8_encoding(scopes, arguments.get(1).copied()) && !self.is_authored_text(&text)).then_some(Source::File(text))
    }

    fn to_string_source<'s>(&self, scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Source> {
        let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"))?;
        if member_name(callee).as_deref() != Some("toString") {
            return None;
        }
        let path = buffer_read(scopes, self.text, callee.node("object")?)?;
        let encoded = utf8_encoding(scopes, call.nodes("arguments").first().copied());
        (encoded && !self.is_authored_text(&path)).then_some(Source::File(path))
    }

    fn decode_source<'s>(&self, scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Source> {
        let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"))?;
        if member_name(callee).as_deref() != Some("decode") {
            return None;
        }
        let decoder = decoder_of(scopes, callee.node("object")?)?;
        let arguments = call.nodes("arguments");
        let token = arguments.first().is_some_and(|input| BASE64_TEXT.is_match(source(self.text, *input)));
        (arguments.len() == 1 && !token && is_lenient_utf8(scopes, decoder)).then_some(Source::Decoder)
    }

    /// `decodedSource`.
    pub fn decoded_source<'s>(&self, scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Source> {
        self.decode_source(scopes, call).or_else(|| self.file_source(scopes, call)).or_else(|| self.to_string_source(scopes, call))
    }
}
