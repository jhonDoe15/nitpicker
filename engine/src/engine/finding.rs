use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Finding {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub rule: String,
    pub message: String,
    /// What SpotBugs names as the place of a finding, where its message does not tell.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    /// SpotBugs' priority of a finding, where it decides how severe the finding is.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u8>,
    /// The values SpotBugs lists with its message, where they are not the place alone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Vec<String>>,
}
