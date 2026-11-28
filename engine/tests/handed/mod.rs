//! The (file, check) pairs that an engine report hands back to Error Prone: its `_HandBack` rows list the checks.
use std::collections::BTreeSet;

pub fn handed_back(findings: &[serde_json::Value], prefix: &str) -> BTreeSet<(String, String)> {
    findings
        .iter()
        .filter(|finding| finding["rule"] == "_HandBack")
        .flat_map(|finding| {
            let file = finding["file"].as_str().expect("file");
            let file = file.strip_prefix(prefix).unwrap_or(file).to_string();
            finding["message"].as_str().expect("message").split(',').map(move |check| (file.clone(), check.to_string()))
        })
        .collect()
}
