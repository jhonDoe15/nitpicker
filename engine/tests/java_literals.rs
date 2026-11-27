//! Java literals the grammar reads differently from javac and PMD 7.16.0: the rows below were checked against both.
use std::path::{Path, PathBuf};
use std::process::Command;

fn folder(name: &str, sources: &[(&str, &str)]) -> PathBuf {
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    for (file, body) in sources {
        std::fs::write(folder.join(format!("{file}.java")), format!("class {file} {{\n{body}\n}}\n")).expect("source");
    }
    folder
}

fn engine(folder: &Path, rules: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg(folder).args(["--rules", rules]);
    command
}

/// PMD reports a parse error for each of these files and javac rejects them; the grammar accepts them.
#[test]
fn literals_java_rejects_break_the_file() {
    let sources = [
        ("Two", "char c = 'ab';"),
        ("QuoteThen", "char c = '\\'\\x';"),
        ("Unknown", "String s = \"\\q\";"),
        ("LineBreak", "String s = \"a\\\nb\";"),
        ("Supplementary", "char c = '\u{20BB7}';"),
        ("BlockEscape", "String s = \"\"\"\n  a\\q\n  \"\"\";"),
        ("Octal", "char c = '\\400';"),
        ("Empty", "char c = '';"),
        ("CarriageReturn", "String s = \"a\\u000d\";"),
        ("Quote", "char c = '\\u0027';"),
        ("Valid", "char c = '\\u0041'; String s = \"\\s\\377\\0\\u005c\\u005c\"; char g = '\\uuuu0041'; String t = \"\"\"\n  a\\\n  b\n  \"\"\";"),
        ("MultiCatch", "void f() { try { } catch (IllegalStateException | @A(v = {1}) IllegalArgumentException | @B Error e) { } }"),
    ];
    let folder = folder("literals", &sources);
    let rules = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("rules").join("edges.json");
    let output = engine(&folder, "_XPath").env("NP_XPATH_RULES", rules).env("NP_XPATH_ONLY", "Field").output().expect("engine runs");
    let _ = std::fs::remove_dir_all(&folder);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    let mut broken: Vec<String> = report["syntaxErrorFiles"]
        .as_array()
        .expect("files")
        .iter()
        .map(|file| Path::new(file.as_str().expect("file")).file_stem().expect("name").to_string_lossy().into_owned())
        .collect();
    broken.sort();
    let mut wanted: Vec<&str> = sources.iter().map(|(name, _)| *name).filter(|name| !["Valid", "MultiCatch"].contains(name)).collect();
    wanted.sort_unstable();
    assert_eq!(broken, wanted);
}

/// The PMD-shaped tree of number and string literals, as PMD's own tree has them.
#[test]
fn literal_attributes_match_pmd() {
    let sources = [(
        "Literals",
        "double a = 012d; float b = 012f; double c = 012e3; double d = 0_12D; double e = 09e1f; double f = 1.012d;\n\
         String s = \"\\uD842\\uDFB7\"; String t = \"\\uD842\"; String u = \"\\uDFB7\\uD842\";",
    )];
    let folder = folder("literal-tree", &sources);
    let out = folder.join("tree");
    std::fs::create_dir_all(&out).expect("out");
    let output = engine(&folder, "_PmdTree").env("NP_TREE_OUT", &out).output().expect("engine runs");
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(report["syntaxErrorFiles"].as_array().map(Vec::len), Some(0));
    let dumped: String =
        std::fs::read_dir(&out).expect("dump").map(|entry| std::fs::read_to_string(entry.expect("file").path()).expect("text")).collect();
    let _ = std::fs::remove_dir_all(&folder);
    let keys = ["Image", "DoubleLiteral", "FloatLiteral", "ValueAsDouble", "ConstValue", "Empty", "Length"];
    let kept = |part: &&str| keys.iter().any(|key| part.starts_with(&format!("{key}=")));
    let literals: Vec<String> = dumped
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("NumericLiteral") || line.starts_with("StringLiteral"))
        .map(|line| line.split(' ').map(|part| part.trim_end_matches('\u{1}')).filter(kept).collect::<Vec<_>>().join(" "))
        .collect();
    let wanted = [
        "DoubleLiteral=true FloatLiteral=false Image=012d ValueAsDouble=12.0",
        "DoubleLiteral=false FloatLiteral=true Image=012f ValueAsDouble=12.0",
        "DoubleLiteral=true FloatLiteral=false Image=012e3 ValueAsDouble=12000.0",
        "DoubleLiteral=true FloatLiteral=false Image=0_12D ValueAsDouble=12.0",
        "DoubleLiteral=false FloatLiteral=true Image=09e1f ValueAsDouble=90.0",
        "DoubleLiteral=true FloatLiteral=false Image=1.012d ValueAsDouble=1.012",
        "ConstValue=\u{20BB7} Empty=false Image=\"\u{20BB7}\" Length=2",
        "ConstValue=\u{FFFD} Empty=false Image=\"\u{FFFD}\" Length=1",
        "ConstValue=\u{FFFD}\u{FFFD} Empty=false Image=\"\u{FFFD}\u{FFFD}\" Length=2",
    ];
    assert_eq!(literals, wanted);
}
