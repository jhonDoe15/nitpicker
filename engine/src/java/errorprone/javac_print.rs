//! An expression as javac prints its tree (`JCTree.toString`), which Error Prone puts into messages: comments and line
//! breaks dropped, one space around binary operators, none after a cast or around `->`, literals by their value, and
//! the adjacent string literals of a `+` chain folded the way javac's parser folds them. Written from javac's output on
//! Error Prone's own sources and on probes (`parity/errorprone/PrettyDump.java`). Block bodies are exact on their
//! first line only, which is what messages are compared by.
use crate::engine::source::{SourceFile, children, named_children, parent};
use crate::java::types::constant::{char_value, literal};
use crate::java::types::expr::literal_text;
use std::collections::HashMap;
use tree_sitter::Node;

pub fn printed(file: &SourceFile, node: Node) -> String {
    let mut out = String::new();
    Printer { file, google: None }.expression(node, &mut out);
    out
}

/// The expression as Error Prone's InlineMe `GooglePrinter` prints a copy of it: a space after a cast, lambdas as
/// `a -> b` and `(A a, B b) -> c`, and each identifier in `qualified` (by node id) after its qualifier and a dot.
pub fn printed_google(file: &SourceFile, node: Node, qualified: &HashMap<usize, String>) -> String {
    let mut out = String::new();
    Printer { file, google: Some(qualified) }.expression(node, &mut out);
    out
}

/// An annotation as javac prints it: `@` and the name as written, then `(` and its arguments when it has any.
pub fn annotation_printed(file: &SourceFile, node: Node) -> String {
    let mut out = String::new();
    Printer { file, google: None }.annotation(node, &mut out);
    out
}

struct Printer<'a> {
    file: &'a SourceFile,
    google: Option<&'a HashMap<usize, String>>,
}

fn parts(node: Node) -> Vec<Node> {
    children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn named(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// A string as javac quotes it: the usual escapes, printable ASCII as is, every other UTF-16 unit as `\uXXXX`.
pub fn quoted(text: &str) -> String {
    let mut out = String::new();
    for unit in text.encode_utf16() {
        match unit {
            8 => out.push_str("\\b"),
            9 => out.push_str("\\t"),
            10 => out.push_str("\\n"),
            12 => out.push_str("\\f"),
            13 => out.push_str("\\r"),
            0x22 => out.push_str("\\\""),
            0x27 => out.push_str("\\'"),
            0x5c => out.push_str("\\\\"),
            0x20..=0x7e => out.push(unit as u8 as char),
            other => out.push_str(&format!("\\u{other:04x}")),
        }
    }
    out
}

/// `Double.toString` and `Float.toString` as their documentation specifies them, from the shortest decimal.
fn java_real(shortest: String, two: String, two_fits: bool) -> String {
    let pick = if two_fits && shortest.split('e').next().is_some_and(|mantissa| !mantissa.contains('.')) { two } else { shortest };
    let (mantissa, exponent) = pick.split_once('e').unwrap_or((&pick, "0"));
    let exponent: i32 = exponent.parse().unwrap_or(0);
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let digits = digits.trim_end_matches('0');
    let digits = if digits.is_empty() { "0" } else { digits };
    if digits == "0" {
        return "0.0".to_string();
    }
    if (-3..7).contains(&exponent) {
        if exponent < 0 {
            return format!("0.{}{digits}", "0".repeat((-exponent - 1) as usize));
        }
        let whole = exponent as usize + 1;
        let padded = format!("{digits:0<whole$}");
        let (head, tail) = padded.split_at(whole);
        return format!("{head}.{}", if tail.is_empty() { "0" } else { tail });
    }
    let (first, rest) = digits.split_at(1);
    format!("{first}.{}E{exponent}", if rest.is_empty() { "0" } else { rest })
}

fn real(image: &str) -> String {
    let lower: String = image.chars().filter(|c| *c != '_').collect::<String>().to_lowercase();
    let float = lower.ends_with('f');
    let body = lower.trim_end_matches(['f', 'd']);
    let hex = body.starts_with("0x");
    if float {
        let value = if hex { literal(image, false).real as f32 } else { body.parse::<f32>().unwrap_or(0.0) };
        let two = format!("{value:.1e}");
        let fits = two.parse::<f32>().is_ok_and(|back| back == value);
        return format!("{}F", java_real(format!("{value:e}"), two, fits));
    }
    let value = if hex { literal(image, false).real } else { body.parse::<f64>().unwrap_or(0.0) };
    let two = format!("{value:.1e}");
    let fits = two.parse::<f64>().is_ok_and(|back| back == value);
    java_real(format!("{value:e}"), two, fits)
}

fn integer(image: &str) -> String {
    let value = literal(image, true);
    if value.long { format!("{}L", value.whole) } else { (value.whole as i32).to_string() }
}

/// `-` before a decimal integer literal, which javac's parser reads as one negative literal.
fn negative(node: Node) -> bool {
    let operator = node.child_by_field_name("operator").map(|operator| operator.kind());
    let operand = node.child_by_field_name("operand").map(|operand| operand.kind());
    operator == Some("-") && operand == Some("decimal_integer_literal")
}

fn character(image: &str) -> String {
    let inner = image.trim_start_matches('\'').trim_end_matches('\'');
    let value = match inner.strip_prefix("\\u") {
        Some(hex) => u32::from_str_radix(hex.trim_start_matches('u'), 16).ok(),
        None => char_value(image),
    };
    let unit = value.unwrap_or(0);
    let text = char::from_u32(unit).map(String::from).unwrap_or_default();
    let shown = if text.is_empty() { format!("\\u{unit:04x}") } else { quoted(&text) };
    format!("'{shown}'")
}

/// The binary expression that a `+` chain belongs to when javac's parser reads it in one go.
fn folds(node: Node) -> bool {
    let Some(up) = parent(node) else { return true };
    match up.kind() {
        "binary_expression" => false,
        "instanceof_expression" => up.child_by_field_name("left") != Some(node),
        _ => true,
    }
}

fn operator<'t>(node: Node<'t>) -> Option<Node<'t>> {
    node.child_by_field_name("operator")
}

impl Printer<'_> {
    fn text(&self, node: Node) -> &str {
        self.file.text_of(node)
    }

    fn joined(&self, nodes: &[Node], separator: &str, out: &mut String) {
        for (at, node) in nodes.iter().enumerate() {
            if at > 0 {
                out.push_str(separator);
            }
            self.expression(*node, out);
        }
    }

    fn block(&self, node: Node, out: &mut String) {
        out.push_str("{\n");
        let inner = self.text(node).trim().trim_start_matches('{').trim_end_matches('}').trim();
        for line in inner.lines().filter(|line| !line.trim().is_empty()) {
            out.push_str("    ");
            out.push_str(line.trim());
            out.push('\n');
        }
        out.push('}');
    }

    fn binary(&self, node: Node, out: &mut String) {
        let plus = |part: Node| part.kind() == "binary_expression" && operator(part).is_some_and(|op| op.kind() == "+");
        if plus(node) && folds(node) {
            let mut operands = Vec::new();
            let mut at = node;
            while plus(at) {
                operands.extend(at.child_by_field_name("right"));
                match at.child_by_field_name("left") {
                    Some(left) => at = left,
                    None => break,
                }
            }
            if !plus(at) {
                operands.push(at);
            }
            operands.reverse();
            let literal = |part: &Node| part.kind() == "string_literal";
            if operands.windows(2).any(|pair| literal(&pair[0]) && literal(&pair[1])) {
                let mut first = true;
                let mut index = 0;
                while index < operands.len() {
                    if !first {
                        out.push_str(" + ");
                    }
                    first = false;
                    if literal(&operands[index]) {
                        let mut value = String::new();
                        while index < operands.len() && literal(&operands[index]) {
                            value.push_str(&literal_text(self.file, operands[index]).unwrap_or_default());
                            index += 1;
                        }
                        out.push('"');
                        out.push_str(&quoted(&value));
                        out.push('"');
                    } else {
                        self.expression(operands[index], out);
                        index += 1;
                    }
                }
                return;
            }
        }
        let (Some(left), Some(op), Some(right)) = (node.child_by_field_name("left"), operator(node), node.child_by_field_name("right")) else {
            return self.fallback(node, out);
        };
        self.expression(left, out);
        out.push(' ');
        out.push_str(op.kind());
        out.push(' ');
        self.expression(right, out);
    }

    fn lambda_parameters(&self, node: Node, out: &mut String) {
        match node.kind() {
            "identifier" => {
                out.push('(');
                out.push_str(self.text(node));
                out.push(')');
            }
            "inferred_parameters" => {
                out.push('(');
                self.joined(&named(node), ",", out);
                out.push(')');
            }
            _ => {
                out.push('(');
                for (at, parameter) in named(node).into_iter().enumerate() {
                    if at > 0 {
                        out.push_str(", ");
                    }
                    self.parameter(parameter, out);
                }
                out.push(')');
            }
        }
    }

    /// The declared type of a lambda parameter, of a variable arity one too.
    fn declared_type(parameter: Node) -> Option<Node> {
        parameter.child_by_field_name("type").or_else(|| named(parameter).into_iter().find(|part| !matches!(part.kind(), "modifiers" | "variable_declarator")))
    }

    /// `GooglePrinter.visitLambda`: explicit parameters printed in parentheses, implicit ones by name, in
    /// parentheses unless there is exactly one, then ` -> ` and the body.
    fn google_lambda(&self, node: Node, out: &mut String) {
        let parameters = node.child_by_field_name("parameters");
        let explicit = parameters.is_some_and(|list| {
            list.kind() == "formal_parameters" && named(list).first().is_some_and(|first| Self::declared_type(*first).is_some_and(|kind| self.text(kind) != "var"))
        });
        let listed: Vec<Node> = match parameters {
            Some(list) if list.kind() == "identifier" => vec![list],
            Some(list) => named(list),
            None => Vec::new(),
        };
        let parentheses = listed.len() != 1 || explicit;
        if parentheses {
            out.push('(');
        }
        for (at, parameter) in listed.iter().enumerate() {
            if at > 0 {
                out.push_str(", ");
            }
            let name = parameter.child_by_field_name("name").or_else(|| {
                named(*parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name"))
            });
            match (explicit, name) {
                (true, Some(name)) => {
                    let dimensions: usize = named(*parameter)
                        .into_iter()
                        .chain(named(*parameter).into_iter().filter(|part| part.kind() == "variable_declarator").flat_map(named))
                        .filter(|part| part.kind() == "dimensions")
                        .map(|part| self.text(part).matches('[').count())
                        .sum();
                    if let Some(holder) = named(*parameter).into_iter().find(|part| part.kind() == "modifiers") {
                        for modifier in parts(holder) {
                            match modifier.kind() {
                                "marker_annotation" | "annotation" => {
                                    out.push_str(&self.collapsed(modifier));
                                    out.push('\n');
                                }
                                word => {
                                    out.push_str(word);
                                    out.push(' ');
                                }
                            }
                        }
                    }
                    if let Some(kind) = Self::declared_type(*parameter) {
                        self.expression(kind, out);
                    }
                    out.push_str(&"[]".repeat(dimensions));
                    out.push_str(if parameter.kind() == "spread_parameter" { "... " } else { " " });
                    out.push_str(self.text(name));
                }
                (_, Some(name)) => out.push_str(self.text(name)),
                (_, None) => out.push_str(self.text(*parameter)),
            }
        }
        if parentheses {
            out.push(')');
        }
        out.push_str(" -> ");
        match node.child_by_field_name("body") {
            Some(body) if body.kind() == "block" => self.block(body, out),
            Some(body) => self.expression(body, out),
            None => {}
        }
    }

    fn parameter(&self, parameter: Node, out: &mut String) {
        let kind = parameter.child_by_field_name("type");
        let name = parameter.child_by_field_name("name");
        let inferred = kind.is_some_and(|kind| self.text(kind) == "var");
        for part in parts(parameter) {
            match part.kind() {
                "modifiers" => {
                    for modifier in parts(part) {
                        match modifier.kind() {
                            "marker_annotation" | "annotation" => {
                                out.push_str(&self.collapsed(modifier));
                                out.push('\n');
                            }
                            word => {
                                out.push_str(word);
                                out.push(' ');
                            }
                        }
                    }
                }
                _ if Some(part) == kind => {
                    if !inferred {
                        self.expression(part, out);
                        out.push(' ');
                    }
                }
                _ if Some(part) == name => out.push_str(self.text(part)),
                "dimensions" => out.push_str(&"[]".repeat(self.text(part).matches('[').count())),
                _ => {}
            }
        }
    }

    fn record_pattern(&self, node: Node, out: &mut String) {
        let mut items = parts(node).into_iter();
        if let Some(kind) = items.next() {
            self.expression(kind, out);
        }
        out.push('(');
        let components: Vec<Node> = parts(node).into_iter().filter(|part| part.kind() == "record_pattern_body").flat_map(named).collect();
        for (at, component) in components.into_iter().enumerate() {
            if at > 0 {
                out.push_str(", ");
            }
            match component.kind() {
                "record_pattern" => self.record_pattern(component, out),
                _ => {
                    let inner = named(component);
                    match inner.as_slice() {
                        [kind, name] if self.text(*kind) == "var" => {
                            out.push_str("/*missing*/ ");
                            out.push_str(self.text(*name));
                        }
                        [kind, name] => {
                            self.expression(*kind, out);
                            out.push(' ');
                            out.push_str(self.text(*name));
                        }
                        [only] if only.kind() == "record_pattern" => self.record_pattern(*only, out),
                        _ => out.push_str(&self.collapsed(component)),
                    }
                }
            }
        }
        out.push(')');
    }

    /// The source text with each run of whitespace as one space, for forms javac prints as written.
    fn collapsed(&self, node: Node) -> String {
        self.text(node).split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn annotation(&self, node: Node, out: &mut String) {
        out.push('@');
        if let Some(name) = node.child_by_field_name("name") {
            self.expression(name, out);
        }
        let arguments = node.child_by_field_name("arguments").map(named).unwrap_or_default();
        if !arguments.is_empty() {
            out.push('(');
            self.joined(&arguments, ", ", out);
            out.push(')');
        }
    }

    fn fallback(&self, node: Node, out: &mut String) {
        out.push_str(&self.collapsed(node));
    }

    fn expression(&self, node: Node, out: &mut String) {
        match node.kind() {
            "identifier" | "type_identifier" if self.google.is_some_and(|qualified| qualified.contains_key(&node.id())) => {
                out.push_str(self.google.and_then(|qualified| qualified.get(&node.id())).map_or("", String::as_str));
                out.push('.');
                out.push_str(self.text(node));
            }
            "identifier" | "type_identifier" | "this" | "super" | "integral_type" | "floating_point_type" | "boolean_type"
            | "void_type" | "true" | "false" | "null_literal" | "new" => out.push_str(self.text(node)),
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => out.push_str(&integer(self.text(node))),
            "decimal_floating_point_literal" | "hex_floating_point_literal" => out.push_str(&real(self.text(node))),
            "character_literal" => out.push_str(&character(self.text(node))),
            "string_literal" => {
                out.push('"');
                out.push_str(&quoted(&literal_text(self.file, node).unwrap_or_default()));
                out.push('"');
            }
            "field_access" | "scoped_type_identifier" | "scoped_identifier" | "method_invocation" | "method_reference" | "generic_type" => {
                for part in parts(node) {
                    match part.kind() {
                        "." | "::" => out.push_str(part.kind()),
                        _ => self.expression(part, out),
                    }
                }
            }
            "argument_list" => {
                out.push('(');
                self.joined(&named(node), ", ", out);
                out.push(')');
            }
            "type_arguments" => {
                out.push('<');
                self.joined(&named(node), ", ", out);
                out.push('>');
            }
            "object_creation_expression" => {
                for part in parts(node) {
                    match part.kind() {
                        "." => out.push('.'),
                        "new" => out.push_str("new "),
                        "class_body" => self.block(part, out),
                        "marker_annotation" | "annotation" => {
                            out.push_str(&self.collapsed(part));
                            out.push(' ');
                        }
                        _ => self.expression(part, out),
                    }
                }
            }
            "array_creation_expression" => {
                for part in parts(node) {
                    match part.kind() {
                        "new" => out.push_str("new "),
                        "dimensions_expr" => {
                            for inner in parts(part) {
                                match inner.kind() {
                                    "[" | "]" => out.push_str(inner.kind()),
                                    "marker_annotation" | "annotation" => {
                                        out.push(' ');
                                        out.push_str(&self.collapsed(inner));
                                        out.push(' ');
                                    }
                                    _ => self.expression(inner, out),
                                }
                            }
                        }
                        "dimensions" => out.push_str(&"[]".repeat(self.text(part).matches('[').count())),
                        "marker_annotation" | "annotation" => {
                            out.push_str(&self.collapsed(part));
                            out.push(' ');
                        }
                        _ => self.expression(part, out),
                    }
                }
            }
            "marker_annotation" | "annotation" => self.annotation(node, out),
            "element_value_pair" => {
                if let (Some(key), Some(value)) = (node.child_by_field_name("key"), node.child_by_field_name("value")) {
                    out.push_str(self.text(key));
                    out.push_str(" = ");
                    self.expression(value, out);
                }
            }
            "array_initializer" | "element_value_array_initializer" => {
                out.push('{');
                self.joined(&named(node), ", ", out);
                out.push('}');
            }
            "array_access" => {
                let (Some(array), Some(index)) = (node.child_by_field_name("array"), node.child_by_field_name("index")) else { return self.fallback(node, out) };
                self.expression(array, out);
                out.push('[');
                self.expression(index, out);
                out.push(']');
            }
            "parenthesized_expression" => {
                out.push('(');
                self.joined(&named(node), "", out);
                out.push(')');
            }
            "cast_expression" => {
                let value = node.child_by_field_name("value");
                let kinds: Vec<Node> = named(node).into_iter().filter(|part| Some(*part) != value).collect();
                out.push('(');
                self.joined(&kinds, " & ", out);
                out.push(')');
                if self.google.is_some() {
                    out.push(' ');
                }
                if let Some(value) = value {
                    self.expression(value, out);
                }
            }
            "unary_expression" if negative(node) => {
                let operand = node.child_by_field_name("operand").map_or("", |operand| self.text(operand));
                let value = literal(operand, true);
                let whole = value.whole.wrapping_neg();
                out.push_str(&if value.long { format!("{whole}L") } else { (whole as i32).to_string() });
            }
            "unary_expression" | "update_expression" => {
                for part in parts(node) {
                    match part.is_named() {
                        true => self.expression(part, out),
                        false => out.push_str(part.kind()),
                    }
                }
            }
            "binary_expression" => self.binary(node, out),
            "ternary_expression" => {
                let field = |name| node.child_by_field_name(name);
                let (Some(condition), Some(yes), Some(no)) = (field("condition"), field("consequence"), field("alternative")) else { return self.fallback(node, out) };
                self.expression(condition, out);
                out.push_str(" ? ");
                self.expression(yes, out);
                out.push_str(" : ");
                self.expression(no, out);
            }
            "assignment_expression" => {
                let (Some(left), Some(op), Some(right)) = (node.child_by_field_name("left"), operator(node), node.child_by_field_name("right")) else { return self.fallback(node, out) };
                self.expression(left, out);
                out.push(' ');
                out.push_str(op.kind());
                out.push(' ');
                self.expression(right, out);
            }
            "instanceof_expression" => {
                for part in parts(node) {
                    match part.kind() {
                        "instanceof" => out.push_str(" instanceof "),
                        "final" => out.push_str("final "),
                        "record_pattern" => self.record_pattern(part, out),
                        _ if node.child_by_field_name("name") == Some(part) => {
                            out.push(' ');
                            out.push_str(self.text(part));
                        }
                        _ => self.expression(part, out),
                    }
                }
            }
            "record_pattern" => self.record_pattern(node, out),
            "lambda_expression" if self.google.is_some() => self.google_lambda(node, out),
            "explicit_constructor_invocation" => {
                if let Some(object) = node.child_by_field_name("object") {
                    self.expression(object, out);
                    out.push('.');
                }
                for field in ["type_arguments", "constructor", "arguments"] {
                    if let Some(part) = node.child_by_field_name(field) {
                        self.expression(part, out);
                    }
                }
            }
            "lambda_expression" => {
                if let Some(parameters) = node.child_by_field_name("parameters") {
                    self.lambda_parameters(parameters, out);
                }
                out.push_str("->");
                match node.child_by_field_name("body") {
                    Some(body) if body.kind() == "block" => self.block(body, out),
                    Some(body) => self.expression(body, out),
                    None => {}
                }
            }
            "class_literal" => {
                self.joined(&named(node).into_iter().filter(|part| !matches!(part.kind(), "marker_annotation" | "annotation")).collect::<Vec<_>>(), "", out);
                out.push_str(".class");
            }
            "array_type" => {
                if let Some(element) = node.child_by_field_name("element") {
                    self.expression(element, out);
                }
                if let Some(dimensions) = node.child_by_field_name("dimensions") {
                    out.push_str(&"[]".repeat(self.text(dimensions).matches('[').count()));
                }
            }
            "wildcard" => {
                out.push('?');
                let lower = parts(node).iter().any(|part| part.kind() == "super");
                if let Some(bound) = named(node).into_iter().rfind(|part| !matches!(part.kind(), "marker_annotation" | "annotation" | "super")) {
                    out.push_str(if lower { " super " } else { " extends " });
                    self.expression(bound, out);
                }
            }
            "annotated_type" => {
                for part in named(node) {
                    match part.kind() {
                        "marker_annotation" | "annotation" => {
                            out.push_str(&self.collapsed(part));
                            out.push(' ');
                        }
                        _ => self.expression(part, out),
                    }
                }
            }
            "switch_expression" => {
                out.push_str("switch ");
                if let Some(condition) = node.child_by_field_name("condition") {
                    self.expression(condition, out);
                }
                out.push(' ');
                match node.child_by_field_name("body") {
                    Some(body) => self.block(body, out),
                    None => out.push_str("{\n}"),
                }
            }
            _ => self.fallback(node, out),
        }
    }
}

#[cfg(test)]
#[path = "javac_print_test.rs"]
mod tests;
