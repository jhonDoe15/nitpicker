//! A file nested thousands of levels deep is linted on a large stack instead of aborting the whole run.
use std::process::Command;

type Row = Vec<serde_json::Value>;

fn lint(files: &[(String, String)], rules: &str) -> Vec<Row> {
    let directory = std::env::temp_dir().join(format!("nitpicker-engine-nested-{}", std::process::id()));
    std::fs::create_dir_all(&directory).expect("directory");
    let lines: Vec<String> = files
        .iter()
        .map(|(name, text)| {
            std::fs::write(directory.join(name), text).expect("file");
            format!("{}\t{name}", directory.join(name).display())
        })
        .collect();
    let list = directory.join("list.tsv");
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", rules, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_dir_all(&directory);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).expect("json")
}

#[test]
fn a_deeply_nested_file_leaves_the_other_files_their_findings() {
    let blocks = format!("{}{}", "{".repeat(6000), "}".repeat(6000));
    let callbacks = format!("f({}1{});", "() => f(".repeat(1500), ")".repeat(1500));
    let hashed = "import { createHash } from 'node:crypto';\ncreateHash('md5');\n".to_string();
    let files = [("a.ts".to_string(), blocks.clone()), ("b.ts".to_string(), blocks), ("c.ts".to_string(), callbacks), ("d.ts".to_string(), hashed)];
    let found = lint(&files, "no-unpaged-listing,no-weak-hash");
    let reported: Vec<(&str, &str)> = found.iter().map(|row| (row[0].as_str().expect("file"), row[1].as_str().expect("rule"))).collect();
    assert_eq!(reported, [("d.ts", "nitpicker/no-weak-hash")]);
}
