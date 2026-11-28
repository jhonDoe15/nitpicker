//! The algorithms behind ArgumentSelectionDefectChecker: Error Prone's name splitting and Needleman-Wunsch distance,
//! and the Hungarian assignment of Kevin L. Stern's library.

/// Error Prone's `NamingConventions.splitToLowercaseTerms`: camel case, underscores and trailing digits split a name.
pub fn split_to_lowercase_terms(name: &str) -> Vec<String> {
    if !name.is_empty() && name.bytes().all(|byte| byte == b'_') {
        return vec![name.to_string()];
    }
    let chars: Vec<char> = name.chars().collect();
    let digits_from = chars.iter().rposition(|part| !part.is_ascii_digit()).map_or(0, |at| at + 1);
    let mut terms = Vec::new();
    let mut current = String::new();
    for (at, part) in chars.iter().enumerate() {
        let before = at.checked_sub(1).map(|previous| chars[previous]);
        let case_change = before.is_some_and(|previous| (previous.is_ascii_lowercase() || previous.is_ascii_digit()) && part.is_ascii_uppercase());
        let digits = at == digits_from && digits_from < chars.len() && before.is_none_or(|previous| !previous.is_ascii_digit() && previous != '_');
        if *part == '_' || case_change || digits {
            if !current.is_empty() {
                terms.push(current.to_lowercase());
                current.clear();
            }
            if *part == '_' {
                continue;
            }
        }
        current.push(*part);
    }
    if !current.is_empty() {
        terms.push(current.to_lowercase());
    }
    terms
}

pub fn convert_to_lower_underscore(name: &str) -> String {
    split_to_lowercase_terms(name).join("_")
}

fn script_cost(open: i64, continuing: i64, length: i64) -> i64 {
    if length == 0 { 0 } else { open + length * continuing }
}

fn edit_distance(source: &str, target: &str, change: i64, open: i64, continuing: i64) -> i64 {
    let source: Vec<char> = source.to_ascii_lowercase().chars().collect();
    let target: Vec<char> = target.to_ascii_lowercase().chars().collect();
    let (rows, columns) = (source.len(), target.len());
    if rows == 0 {
        return script_cost(open, continuing, columns as i64);
    }
    if columns == 0 {
        return script_cost(open, continuing, rows as i64);
    }
    let big = i64::from(i32::MAX / 2);
    let mut matched = vec![vec![0i64; columns + 1]; rows + 1];
    let mut deleted = matched.clone();
    let mut inserted = matched.clone();
    for i in 1..=rows {
        matched[i][0] = script_cost(open, continuing, i as i64);
        deleted[i][0] = matched[i][0];
        inserted[i][0] = big;
    }
    for j in 1..=columns {
        matched[0][j] = script_cost(open, continuing, j as i64);
        inserted[0][j] = matched[0][j];
        deleted[0][j] = big;
    }
    for i in 1..=rows {
        for j in 1..=columns {
            let cost = if source[i - 1] == target[j - 1] { 0 } else { change };
            matched[i][j] = cost + matched[i - 1][j - 1].min(inserted[i - 1][j - 1]).min(deleted[i - 1][j - 1]);
            deleted[i][j] = (matched[i - 1][j] + open + continuing).min(deleted[i - 1][j] + continuing);
            inserted[i][j] = (matched[i][j - 1] + open + continuing).min(inserted[i][j - 1] + continuing);
        }
    }
    matched[rows][columns].min(deleted[rows][columns]).min(inserted[rows][columns])
}

fn worst_case(source: i64, target: i64, change: i64, open: i64, continuing: i64) -> i64 {
    let (longer, shorter) = (source.max(target), source.min(target));
    let changing = script_cost(open, continuing, longer - shorter) + shorter * change;
    let blowing = script_cost(open, continuing, source) + script_cost(open, continuing, target);
    changing.min(blowing)
}

/// `NeedlemanWunschEditDistance.getNormalizedEditDistance` with the case ignored.
pub fn normalized_edit_distance(source: &str, target: &str, change: i64, open: i64, continuing: i64) -> f64 {
    if source.is_empty() && target.is_empty() {
        return 0.0;
    }
    let distance = edit_distance(source, target, change, open, continuing) as f64;
    distance / worst_case(source.chars().count() as i64, target.chars().count() as i64, change, open, continuing) as f64
}

/// The assignment of Kevin L. Stern's `HungarianAlgorithm`: for each row the column it is given.
pub struct Hungarian {
    cost: Vec<Vec<f64>>,
    rows: usize,
    columns: usize,
    dim: usize,
    label_by_worker: Vec<f64>,
    label_by_job: Vec<f64>,
    min_slack_worker: Vec<i64>,
    min_slack_value: Vec<f64>,
    match_job: Vec<i64>,
    match_worker: Vec<i64>,
    parent_worker: Vec<i64>,
    committed: Vec<bool>,
}

impl Hungarian {
    pub fn new(matrix: &[Vec<f64>]) -> Hungarian {
        let rows = matrix.len();
        let columns = matrix[0].len();
        let dim = rows.max(columns);
        let cost = (0..dim).map(|worker| (0..dim).map(|job| if worker < rows && job < columns { matrix[worker][job] } else { 0.0 }).collect()).collect();
        Hungarian {
            cost,
            rows,
            columns,
            dim,
            label_by_worker: vec![0.0; dim],
            label_by_job: vec![0.0; dim],
            min_slack_worker: vec![0; dim],
            min_slack_value: vec![0.0; dim],
            match_job: vec![-1; dim],
            match_worker: vec![-1; dim],
            parent_worker: vec![0; dim],
            committed: vec![false; dim],
        }
    }

    pub fn execute(&mut self) -> Vec<i64> {
        self.reduce();
        for job in 0..self.dim {
            self.label_by_job[job] = f64::INFINITY;
        }
        for worker in 0..self.dim {
            for job in 0..self.dim {
                if self.cost[worker][job] < self.label_by_job[job] {
                    self.label_by_job[job] = self.cost[worker][job];
                }
            }
        }
        self.greedy_match();
        let mut worker = self.unmatched_worker();
        while worker < self.dim {
            self.initialize_phase(worker);
            self.execute_phase();
            worker = self.unmatched_worker();
        }
        let mut result: Vec<i64> = self.match_job[..self.rows].to_vec();
        for job in result.iter_mut() {
            if *job >= self.columns as i64 {
                *job = -1;
            }
        }
        result
    }

    fn reduce(&mut self) {
        for worker in 0..self.dim {
            let least = self.cost[worker].iter().copied().fold(f64::INFINITY, |least, value| if value < least { value } else { least });
            for job in 0..self.dim {
                self.cost[worker][job] -= least;
            }
        }
        let mut least = vec![f64::INFINITY; self.dim];
        for worker in 0..self.dim {
            for job in 0..self.dim {
                if self.cost[worker][job] < least[job] {
                    least[job] = self.cost[worker][job];
                }
            }
        }
        for worker in 0..self.dim {
            for job in 0..self.dim {
                self.cost[worker][job] -= least[job];
            }
        }
    }

    fn greedy_match(&mut self) {
        for worker in 0..self.dim {
            for job in 0..self.dim {
                if self.match_job[worker] == -1 && self.match_worker[job] == -1 && self.cost[worker][job] - self.label_by_worker[worker] - self.label_by_job[job] == 0.0 {
                    self.matched(worker, job);
                }
            }
        }
    }

    fn matched(&mut self, worker: usize, job: usize) {
        self.match_job[worker] = job as i64;
        self.match_worker[job] = worker as i64;
    }

    fn unmatched_worker(&self) -> usize {
        self.match_job.iter().position(|job| *job == -1).unwrap_or(self.dim)
    }

    fn initialize_phase(&mut self, worker: usize) {
        self.committed.iter_mut().for_each(|flag| *flag = false);
        self.parent_worker.iter_mut().for_each(|parent| *parent = -1);
        self.committed[worker] = true;
        for job in 0..self.dim {
            self.min_slack_value[job] = self.cost[worker][job] - self.label_by_worker[worker] - self.label_by_job[job];
            self.min_slack_worker[job] = worker as i64;
        }
    }

    fn update_labeling(&mut self, slack: f64) {
        for worker in 0..self.dim {
            if self.committed[worker] {
                self.label_by_worker[worker] += slack;
            }
        }
        for job in 0..self.dim {
            if self.parent_worker[job] != -1 {
                self.label_by_job[job] -= slack;
            } else {
                self.min_slack_value[job] -= slack;
            }
        }
    }

    fn execute_phase(&mut self) {
        loop {
            let mut slack_worker = -1i64;
            let mut slack_job = -1i64;
            let mut slack_value = f64::INFINITY;
            for job in 0..self.dim {
                if self.parent_worker[job] == -1 && self.min_slack_value[job] < slack_value {
                    slack_value = self.min_slack_value[job];
                    slack_worker = self.min_slack_worker[job];
                    slack_job = job as i64;
                }
            }
            if slack_value > 0.0 {
                self.update_labeling(slack_value);
            }
            let job = slack_job as usize;
            self.parent_worker[job] = slack_worker;
            if self.match_worker[job] == -1 {
                let mut committed_job = slack_job;
                let mut parent = self.parent_worker[committed_job as usize];
                loop {
                    let previous = self.match_job[parent as usize];
                    self.matched(parent as usize, committed_job as usize);
                    committed_job = previous;
                    if committed_job == -1 {
                        break;
                    }
                    parent = self.parent_worker[committed_job as usize];
                }
                return;
            }
            let worker = self.match_worker[job] as usize;
            self.committed[worker] = true;
            for other in 0..self.dim {
                if self.parent_worker[other] == -1 {
                    let slack = self.cost[worker][other] - self.label_by_worker[worker] - self.label_by_job[other];
                    if self.min_slack_value[other] > slack {
                        self.min_slack_value[other] = slack;
                        self.min_slack_worker[other] = worker as i64;
                    }
                }
            }
        }
    }
}
