//! Runs the engine's SpotBugs patterns on small Java fixtures and compares pattern, line and message with what
//! SpotBugs 4.9.8 reported for the compiled fixtures. `parity/spotbugs/rows.py` turns a SpotBugs XML report into rows.
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, String);

fn found_in(case: &Path, name: &str) -> BTreeSet<Row> {
    found_with(case, name, "message")
}

fn found_with(case: &Path, name: &str, key: &str) -> BTreeSet<Row> {
    found_listed(case, name, key).into_iter().collect()
}

/// The class files javac 21 with Lombok 1.18.36 wrote for a fixture, kept in `tests/fixtures/spotbugs-classes`.
fn compiled_classes(case: &Path, name: &str) -> Vec<std::ffi::OsString> {
    let classes = case.parent().and_then(Path::parent).map(|fixtures| fixtures.join("spotbugs-classes").join(name));
    classes.filter(|classes| classes.is_dir()).map(|classes| vec!["--classes".into(), classes.into_os_string()]).unwrap_or_default()
}

fn found_listed(case: &Path, name: &str, key: &str) -> Vec<Row> {
    found_findings(case, name, key).into_iter().map(|(row, _)| row).collect()
}

fn found_findings(case: &Path, name: &str, key: &str) -> Vec<(Row, Vec<String>)> {
    static RUNS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let run = RUNS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-spotbugs-{name}-{key}-{}-{run}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(case)
        .args(["--rules", "_SpotBugs", "--out"])
        .arg(&out)
        .args(name.starts_with("lombok").then_some("--lombok"))
        .args(compiled_classes(case, name))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", case.display());
    let text = |finding: &serde_json::Value, key: &str| finding[key].as_str().expect("text").to_string();
    report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = text(finding, "file");
            let file = format!("{name}/{}", file.strip_prefix(&prefix).unwrap_or(&file));
            let listed = finding["arguments"].as_array().map(|listed| listed.iter().filter_map(|argument| argument.as_str().map(String::from)).collect());
            let shown = finding[key].as_str().map(String::from).or_else(|| finding[key].as_u64().map(|number| number.to_string()));
            ((file, text(finding, "rule"), finding["line"].as_u64().expect("line"), shown.unwrap_or_default()), listed.unwrap_or_default())
        })
        .collect()
}

#[test]
fn patterns_report_what_spotbugs_reports() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs.json")).expect("expected")).expect("rows");
    let expected: BTreeSet<Row> = expected.into_iter().collect();
    let mut found = BTreeSet::new();
    for case in std::fs::read_dir(root.join("fixtures").join("spotbugs")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        found.extend(found_in(&case, &name));
    }
    let missed: Vec<&Row> = expected.difference(&found).collect();
    let extra: Vec<&Row> = found.difference(&expected).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.iter().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), 94);
}

/// SpotBugs names the variable a stored value came from; `tests/expected/spotbugs-variables.json` holds the names
/// SpotBugs gave for the compiled fixtures (the fully qualified name of the finding's place in its SARIF report).
#[test]
fn stores_name_the_variable_spotbugs_names() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-variables.json")).expect("expected")).expect("rows");
    let expected: BTreeSet<Row> = expected.into_iter().collect();
    let mut found = BTreeSet::new();
    for case in std::fs::read_dir(root.join("fixtures").join("spotbugs")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        found.extend(found_with(&case, &name, "symbol").into_iter().filter(|row| row.1.starts_with("EI_EXPOSE") && row.1.ends_with("REP2")));
    }
    let missed: Vec<&Row> = expected.difference(&found).collect();
    let extra: Vec<&Row> = found.difference(&expected).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
}

/// SpotBugs' SARIF report names a place for each finding: `tests/expected/spotbugs-places.json` holds them as
/// `kind:fully qualified name`, one row per SARIF result, for the fixtures it lists. The engine adds the package of
/// the file after a `|` when it is not the package of the place.
#[test]
fn findings_name_the_place_spotbugs_sarif_names() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let mut expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-places.json")).expect("expected")).expect("rows");
    expected.sort();
    let cases: BTreeSet<String> = expected.iter().filter_map(|row| row.0.split('/').next().map(String::from)).collect();
    let rules: BTreeSet<String> = expected.iter().map(|row| row.1.clone()).collect();
    let mut found: Vec<Row> = Vec::new();
    for name in &cases {
        let case = root.join("fixtures").join("spotbugs").join(name);
        let listed = found_findings(&case, name, "symbol").into_iter().filter(|(row, _)| rules.contains(&row.1));
        let kept = |place: &str| place.split(['|', '@']).next().unwrap_or_default().to_string();
        found.extend(listed.map(|((file, rule, line, place), listed)| {
            let place = under_method(&rule, &kept(&place), &listed);
            (file, rule, line, place)
        }));
    }
    found.sort();
    assert_eq!(found, expected);
}

/// For a lock or a null dereference, SpotBugs' SARIF names a field under the class of the method that reads it;
/// nitpicker writes it so from the method the finding lists second.
fn under_method(rule: &str, place: &str, listed: &[String]) -> String {
    let (Some(field), Some(method)) = (place.strip_prefix("member:"), listed.get(1)) else { return place.to_string() };
    if !rule.starts_with("JLM_JSR166_") && rule != "NP_ALWAYS_NULL" {
        return place.to_string();
    }
    let signature = method.split('(').next().unwrap_or_default();
    let class = signature.strip_prefix("new ").unwrap_or_else(|| signature.rsplit_once('.').map_or("", |(class, _)| class));
    format!("member:{class}.{}", field.rsplit('.').next().unwrap_or_default())
}

/// SpotBugs lists the lock's type and the method for a lock taken with `synchronized`:
/// `tests/expected/spotbugs-arguments.json` holds the message arguments of its SARIF results for the fixtures it lists.
#[test]
fn locks_list_the_arguments_spotbugs_sarif_lists() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let mut expected: Vec<(String, String, u64, Vec<String>)> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-arguments.json")).expect("expected")).expect("rows");
    expected.sort();
    let cases: BTreeSet<String> = expected.iter().filter_map(|row| row.0.split('/').next().map(String::from)).collect();
    let mut found = Vec::new();
    for name in &cases {
        let case = root.join("fixtures").join("spotbugs").join(name);
        let listed = found_findings(&case, name, "symbol").into_iter().filter(|(row, _)| row.1.starts_with("JLM_JSR166_"));
        found.extend(listed.map(|((file, rule, line, _), listed)| (file, rule, line, listed)));
    }
    found.sort();
    assert_eq!(found, expected);
}

/// FindSecBugs reports a sink at priority 1 for a tainted value and 2 for an unknown one:
/// `tests/expected/spotbugs-taint.json` holds file, line and priority of each path, SQL, command and LDAP injection
/// finding it made on the compiled `taint_*` fixtures.
const INJECTIONS: &[&str] = &[
    "PATH_TRAVERSAL_IN",
    "PATH_TRAVERSAL_OUT",
    "SQL_INJECTION_JDBC",
    "SQL_INJECTION_SPRING_JDBC",
    "SQL_INJECTION_JPA",
    "COMMAND_INJECTION",
    "LDAP_INJECTION",
];

#[test]
fn taint_sinks_have_the_priority_findsecbugs_gives() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let mut expected: Vec<(String, u64, u64)> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-taint.json")).expect("expected")).expect("rows");
    expected.sort();
    let mut found = Vec::new();
    for case in std::fs::read_dir(root.join("fixtures").join("spotbugs")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        if !name.starts_with("taint_") {
            continue;
        }
        let listed = found_listed(&case, &name, "priority").into_iter().filter(|row| INJECTIONS.contains(&row.1.as_str()));
        found.extend(listed.map(|(file, _, line, priority)| (file, line, priority.parse().expect("priority"))));
    }
    found.sort();
    assert_eq!(found, expected);
}

/// The JVM type names of a method descriptor's parameters, as `injection-sinks.tsv` writes them.
fn descriptor_parameters(descriptor: &str) -> Vec<String> {
    let listed = descriptor.trim_start_matches('(').split(')').next().unwrap_or_default();
    let mut found = Vec::new();
    let mut chars = listed.chars().peekable();
    while chars.peek().is_some() {
        let mut arrays = 0;
        while chars.peek() == Some(&'[') {
            chars.next();
            arrays += 1;
        }
        let name = match chars.next() {
            Some('L') => chars.by_ref().take_while(|part| *part != ';').collect::<String>().replace('/', "."),
            Some(code) => {
                let names = [('I', "int"), ('J', "long"), ('Z', "boolean"), ('B', "byte"), ('C', "char"), ('S', "short"), ('F', "float"), ('D', "double")];
                names.iter().find(|(known, _)| *known == code).map(|(_, name)| name.to_string()).unwrap_or_default()
            }
            None => break,
        };
        found.push(format!("{name}{}", "[]".repeat(arrays)));
    }
    found
}

/// nitpicker hands FindSecBugs sink files of its own; each of their sinks is a row of the engine's sink table. A
/// position in those files counts from the last parameter.
#[test]
fn sink_files_nitpicker_hands_findsecbugs_are_in_the_sink_table() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let table = std::fs::read_to_string(root.join("src/java/spotbugs/taint/injection-sinks.tsv")).expect("table");
    let rows: BTreeSet<(String, String, String, String, String)> = table
        .lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .filter_map(|line| match line.split('\t').collect::<Vec<_>>()[..] {
            [pattern, owner, name, parameters, positions] => Some((pattern.into(), owner.into(), name.into(), parameters.into(), positions.into())),
            _ => None,
        })
        .collect();
    let security = root.join("../languages/java/gradle/security");
    let files = [("path-sinks.txt", "PATH_TRAVERSAL_IN"), ("jakarta-sinks.txt", "SQL_INJECTION_JPA"), ("spring-jdbc-sinks.txt", "SQL_INJECTION_SPRING_JDBC")];
    let mut missing = Vec::new();
    let mut checked = 0;
    for (file, pattern) in files {
        for line in std::fs::read_to_string(security.join(file)).expect("sinks").lines().filter(|line| !line.trim().is_empty()) {
            let (call, positions) = line.rsplit_once(':').expect("positions");
            let (owner, method) = call.split_once('.').expect("method");
            let (name, descriptor) = method.split_at(method.find('(').expect("descriptor"));
            let parameters = descriptor_parameters(descriptor);
            let counted: Vec<usize> = positions.split(',').map(|position| position.parse().expect("position")).collect();
            assert!(counted.iter().all(|position| *position < parameters.len()), "position beyond the parameters: {line}");
            let mut indexes: Vec<usize> = counted.iter().map(|position| parameters.len() - 1 - position).collect();
            indexes.sort();
            let listed = indexes.iter().map(usize::to_string).collect::<Vec<_>>().join(",");
            let row = (pattern.to_string(), owner.replace('/', "."), name.to_string(), parameters.join(","), listed);
            checked += 1;
            if !rows.contains(&row) {
                missing.push(row);
            }
        }
    }
    assert!(checked > 0 && missing.is_empty(), "checked {checked}, missing {missing:?}");
}
