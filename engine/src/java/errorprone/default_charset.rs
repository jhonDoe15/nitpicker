//! DefaultCharset: readers, writers and conversions that fall back to the platform charset.
use super::fixes::Fix;
use super::shape::{arguments, preferred};
use super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Implicit use of the platform default charset, which can result in differing behaviour between JVM executions or incorrect behavior if the encoding of the data source doesn't match expectations.";
const CHARSETS: [&str; 2] = ["UTF_8", "Charset.defaultCharset()"];

fn constructor_of(context: &Context, node: Node, class: &str, shapes: &[&[&str]]) -> bool {
    if node.kind() != "object_creation_expression" || children(node).iter().any(|part| part.kind() == "class_body") {
        return false;
    }
    let simple = class.rsplit('.').next().unwrap_or(class);
    if node.child_by_field_name("type").is_none_or(|written| !context.text(written).ends_with(simple)) {
        return false;
    }
    let Some((call, formals)) = context.resolver.call_formals(node) else { return false };
    if call.declaring != class {
        return false;
    }
    let names: Vec<String> = formals.iter().map(Type::name).collect();
    shapes.iter().any(|shape| shape.len() == names.len() && shape.iter().zip(&names).all(|(want, have)| want == have))
}

fn append_charsets(tree: Node, select_end: usize) -> Vec<Fix> {
    let args = arguments(tree);
    CHARSETS
        .iter()
        .map(|charset| match args.last() {
            None => Fix::replace(select_end, tree.end_byte(), format!("({charset})")),
            Some(last) => Fix::new().insert(last.end_byte(), format!(", {charset}")),
        })
        .map(|fix| fix.with_imports())
        .collect()
}

fn is_string(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.lang.String"))
}

fn is_file(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.io.File"))
}

fn to_path(context: &Context, arg: Node) -> Option<String> {
    if is_string(context, arg) {
        Some(format!("Paths.get({})", context.text(arg)))
    } else if is_file(context, arg) {
        Some(format!("{}.toPath()", context.text(arg)))
    } else {
        None
    }
}

fn to_file(context: &Context, arg: Node) -> Option<String> {
    if is_string(context, arg) {
        Some(format!("new File({})", context.text(arg)))
    } else if is_file(context, arg) {
        Some(context.text(arg).to_string())
    } else {
        None
    }
}

fn uses_guava(context: &Context) -> bool {
    context.resolver.scope.single.values().any(|name| name == "com.google.common.io.Files")
}

/// The declared type to turn into `Reader` or `Writer` when the new stream is stored in a variable of its own type.
fn variable_type_fix(context: &Context, creation: Node, class: &str, replacement: &str) -> Option<(usize, usize, String)> {
    let holder = parent(creation)?;
    let name = match holder.kind() {
        "variable_declarator" => holder.child_by_field_name("name")?,
        "assignment_expression" if holder.child_by_field_name("right") == Some(creation) => holder.child_by_field_name("left")?,
        _ => return None,
    };
    if holder.kind() == "assignment_expression" && !matches!(context.resolver.type_of(name), Some(Type::Class(own, _)) if own == class) {
        return None;
    }
    let text = context.text(name);
    let mut found = None;
    walk(context.file.tree.root_node(), |node| {
        if found.is_some() || node.kind() != "variable_declarator" || node.child_by_field_name("name").is_none_or(|declared| context.text(declared) != text) {
            return;
        }
        let Some(declaration) = parent(node) else { return };
        let Some(written) = declaration.child_by_field_name("type") else { return };
        if context.text(written) == "var" || !context.resolver.type_node(written).is_some_and(|kind| kind.name() == class) {
            return;
        }
        if holder.kind() == "assignment_expression" || holder.id() == node.id() {
            found = Some((written.start_byte(), written.end_byte(), replacement.to_string()));
        }
    });
    found
}

fn with_variable(fix: Fix, edit: Option<(usize, usize, String)>) -> Fix {
    match edit {
        Some((start, end, text)) => fix.and(start, end, text),
        None => fix,
    }
}

fn buffered_parent<'t>(context: &Context, creation: Node<'t>, class: &str) -> Node<'t> {
    let outer = parent(creation).filter(|list| list.kind() == "argument_list").and_then(parent);
    match outer {
        Some(outer) if constructor_of(context, outer, class, &[&["java.io.Writer"], &["java.io.Writer", "int"], &["java.io.Reader"], &["java.io.Reader", "int"]]) => outer,
        _ => creation,
    }
}

fn file_reader(context: &Context, node: Node) -> Vec<Fix> {
    let arg = arguments(node)[0];
    let target = buffered_parent(context, node, "java.io.BufferedReader");
    let edit = variable_type_fix(context, node, "java.io.FileReader", "Reader");
    CHARSETS
        .iter()
        .filter_map(|charset| {
            let fix = if uses_guava(context) {
                Fix::replace(target.start_byte(), target.end_byte(), format!("Files.newReader({}, {charset})", to_file(context, arg)?))
            } else {
                Fix::replace(target.start_byte(), target.end_byte(), format!("Files.newBufferedReader({}, {charset})", to_path(context, arg)?))
            };
            Some(with_variable(fix, edit.clone()).with_imports())
        })
        .collect()
}

fn file_writer(context: &Context, node: Node) -> Vec<Fix> {
    let args = arguments(node);
    let target = buffered_parent(context, node, "java.io.BufferedWriter");
    let edit = variable_type_fix(context, node, "java.io.FileWriter", "Writer");
    let guava = uses_guava(context);
    CHARSETS
        .iter()
        .filter_map(|charset| {
            let text = if args.len() == 1 && guava {
                format!("Files.newWriter({}, {charset})", to_file(context, args[0])?)
            } else {
                let head = if guava { "java.nio.file.Files" } else { "Files" };
                let mut text = format!("{head}.newBufferedWriter({}, {charset}", to_path(context, args[0])?);
                if let Some(append) = args.get(1) {
                    match append.kind() {
                        "true" => text.push_str(", CREATE, APPEND"),
                        "false" => {}
                        _ => text.push_str(&format!(", {} ? new StandardOpenOption[] {{CREATE, APPEND}} : new StandardOpenOption[] {{CREATE}}", context.text(*append))),
                    }
                }
                text.push(')');
                text
            };
            Some(with_variable(Fix::replace(target.start_byte(), target.end_byte(), text), edit.clone()).with_imports())
        })
        .collect()
}

fn byte_string(tree: Node, outer: Node) -> Vec<Fix> {
    let Some(receiver) = tree.child_by_field_name("object") else { return Vec::new() };
    let build = |prefix: &str, suffix: &str| {
        let head = match outer.child_by_field_name("object") {
            Some(object) => Fix::replace(object.end_byte(), tree.start_byte(), format!(".{prefix}")),
            None => Fix::replace(outer.start_byte(), tree.start_byte(), prefix),
        };
        head.and(receiver.end_byte(), tree.end_byte(), suffix)
    };
    vec![build("copyFromUtf8(", ""), build("copyFrom(", ", Charset.defaultCharset()").with_imports()]
}

fn wrap_print(arg: Node, text: impl Fn(&str) -> (String, String)) -> Vec<Fix> {
    CHARSETS
        .iter()
        .map(|charset| {
            let (before, after) = text(charset);
            let fix = Fix::new().insert(arg.start_byte(), before).insert(arg.end_byte(), after);
            fix.with_imports()
        })
        .collect()
}

pub fn default_charset(context: &Context, node: Node) {
    let fixes = match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            let select_end = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.end_byte());
            match name {
                "getBytes" if node.child_by_field_name("object").is_some() && context.resolver.matches_sig(node, "java.lang.String#getBytes()") => {
                    let outer = parent(node).and_then(parent).filter(|outer| outer.kind() == "method_invocation");
                    match outer.filter(|outer| parent(node).is_some_and(|list| list.kind() == "argument_list") && context.resolver.matches_sig(*outer, "com.google.protobuf.ByteString#copyFrom(_*)")) {
                        Some(outer) => byte_string(node, outer),
                        None => append_charsets(node, select_end),
                    }
                }
                "newWriter" if context.resolver.matches_sig(node, "com.google.common.io.Files#newWriter(java.lang.String)") => append_charsets(node, select_end),
                "toString" if arguments(node).is_empty() && context.resolver.matches_sig(node, "java.io.ByteArrayOutputStream#toString()") => append_charsets(node, select_end),
                _ => return,
            }
        }
        "object_creation_expression" => {
            let class_end = node.child_by_field_name("type").map_or(node.end_byte(), |written| written.end_byte());
            if constructor_of(context, node, "java.lang.String", &[&["byte[]"], &["byte[]", "int", "int"]])
                || constructor_of(context, node, "java.io.OutputStreamWriter", &[&["java.io.OutputStream"]])
                || constructor_of(context, node, "java.io.InputStreamReader", &[&["java.io.InputStream"]])
            {
                append_charsets(node, class_end)
            } else if constructor_of(context, node, "java.io.FileReader", &[&["java.io.File"], &["java.lang.String"]]) {
                file_reader(context, node)
            } else if constructor_of(context, node, "java.io.FileWriter", &[&["java.io.File"], &["java.io.File", "boolean"], &["java.lang.String"], &["java.lang.String", "boolean"]]) {
                file_writer(context, node)
            } else if constructor_of(context, node, "java.io.PrintWriter", &[&["java.io.File"], &["java.lang.String"]])
                || constructor_of(context, node, "java.util.Scanner", &[&["java.io.InputStream"], &["java.io.File"], &["java.nio.file.Path"], &["java.nio.channels.ReadableByteChannel"]])
            {
                let arg = arguments(node)[0];
                CHARSETS.iter().map(|charset| Fix::new().insert(arg.end_byte(), format!(", {charset}")).with_imports()).collect()
            } else if constructor_of(context, node, "java.io.PrintWriter", &[&["java.io.OutputStream"], &["java.io.OutputStream", "boolean"]]) {
                wrap_print(arguments(node)[0], |charset| ("new BufferedWriter(new OutputStreamWriter(".to_string(), format!(", {charset}))")))
            } else {
                return;
            }
        }
        _ => return,
    };
    context.report_fixed("DefaultCharset", node, preferred(node), MESSAGE, &fixes);
}
