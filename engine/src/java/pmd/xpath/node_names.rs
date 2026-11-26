//! Every element name the XPath rules of the Java rulesets ask for is a node type of PMD 7. PMD accepts an
//! unknown name without complaint and selects nothing, so a misspelt or PMD 6 name silently turns a branch off.
use super::parse::Parser;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

fn rule_files(folder: &Path, found: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(folder).expect("folder") {
        let path = entry.expect("entry").path();
        if path.is_dir() {
            rule_files(&path, found);
        } else if path.extension().is_some_and(|extension| extension == "xml") {
            found.push(path);
        }
    }
}

fn unescape(text: &str) -> String {
    text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

fn queries(text: &str) -> Vec<String> {
    let property = regex::Regex::new(
        r#"name="(?:xpath|violationSuppressXPath)"\s*(?:value="([^"]*)"|>\s*<value>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*</value>)"#,
    )
    .expect("regex");
    property
        .captures_iter(text)
        .map(|found| match (found.get(1), found.get(2), found.get(3)) {
            (Some(written), _, _) | (_, _, Some(written)) => unescape(written.as_str()),
            (_, Some(written), _) => written.as_str().to_string(),
            _ => unreachable!(),
        })
        .collect()
}

#[test]
fn rules_name_only_node_types_pmd_has() {
    let engine = Path::new(env!("CARGO_MANIFEST_DIR"));
    let known: BTreeSet<String> =
        std::fs::read_to_string(engine.join("tests/rules/pmd-node-names.txt")).expect("names").lines().map(str::to_string).collect();
    let step = regex::Regex::new(r#"Step\((\w+), Named\("([^"]+)"\)"#).expect("regex");
    let mut files = Vec::new();
    rule_files(&engine.join("../languages/java"), &mut files);
    let mut unknown = BTreeSet::new();
    let mut checked = 0;
    for file in files {
        let text = std::fs::read_to_string(&file).expect("rules");
        if !text.contains("XPathRule") {
            continue;
        }
        for query in queries(&text) {
            let (expr, _) = Parser::parse(&query, Vec::new()).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
            checked += 1;
            let shape = format!("{expr:?}");
            let named = step.captures_iter(&shape).filter(|found| &found[1] != "Attribute" && !found[2].contains(':'));
            for name in named.map(|found| found[2].to_string()) {
                if !known.contains(&name) {
                    unknown.insert(format!("{}: {name}", file.strip_prefix(engine.join("..")).unwrap_or(&file).display()));
                }
            }
        }
    }
    assert!(checked > 200, "only {checked} queries found");
    assert!(unknown.is_empty(), "names PMD 7 has no node for: {unknown:#?}");
}
