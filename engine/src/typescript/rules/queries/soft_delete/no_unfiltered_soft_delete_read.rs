//! `no-unfiltered-soft-delete-read`: an ORM read of a table without the soft-delete or visibility filter that the
//! project's other reads of that table apply. The ORMs and the learned filters come as the rule's settings.
use super::columns::{TableFilter, filters_by_table};
use super::read_mentions::{TableEntry, read_mentions};
use crate::typescript::rules::Context;
use crate::typescript::rules::jobs::item_work::is_consumed;

const RULE: &str = "no-unfiltered-soft-delete-read";

fn is_guarded(entry: &TableEntry, filter: &TableFilter) -> bool {
    entry.columns.iter().any(|(key, _)| filter.columns.iter().any(|(known, _)| known == key)) || entry.helpers.iter().any(|helper| filter.helpers.contains(helper))
}

fn filter_text(filter: &TableFilter) -> String {
    let columns = filter.columns.iter().map(|(_, column)| format!("`{column}`"));
    let helpers = filter.helpers.iter().map(|helper| format!("the helper `{helper}`"));
    columns.chain(helpers).collect::<Vec<_>>().join(" or ")
}

fn message(table: &str, filter: &str) -> String {
    format!(
        "This reads `{table}` without the soft-delete or visibility filter that most reads of that table apply ({filter}), so trashed or hidden rows can reach the result. Add the filter, or call the project helper that adds it. An exception fits a trash, restore, purge or admin query that reads those rows on purpose."
    )
}

fn listed(context: &Context, key: &str) -> Vec<String> {
    context.setting(&format!("{RULE}.{key}")).and_then(|text| serde_json::from_str(text).ok()).unwrap_or_default()
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let orms = listed(context, "orms");
    let by_table = filters_by_table(&listed(context, "filters"));
    if orms.is_empty() || by_table.is_empty() {
        return;
    }
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression") && is_consumed(*node)) {
        let Some(mentions) = read_mentions(call, &orms).filter(|mentions| !mentions.acknowledged) else { continue };
        let missing = mentions.tables.iter().find_map(|entry| {
            let table = entry.table.as_deref()?;
            let (_, filter) = by_table.iter().find(|(known, _)| known == table)?;
            (!is_guarded(entry, filter)).then(|| message(table, &filter_text(filter)))
        });
        if let Some(text) = missing {
            found.push((call.start(), call.end(), text));
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
