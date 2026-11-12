package main

import (
	"github.com/jhonDoe15/nitpicker/languages/go/lint/catalog"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

var offsets = map[string]int{"-above": -1, "-below": 1}

var marker = regexp.MustCompile(`// want(-above|-below|-at \d+)? ((?:[\w-]+ ?)+)$`)

func fixtureRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs("fixtures")
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func wanted(t *testing.T, root string) map[string]bool {
	t.Helper()
	want := map[string]bool{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relative, _ := filepath.Rel(root, path)
		for index, line := range strings.Split(string(data), "\n") {
			match := marker.FindStringSubmatch(line)
			if match == nil {
				continue
			}
			line := index + 1 + offsets[match[1]]
			if at, found := strings.CutPrefix(match[1], "-at "); found {
				line, _ = strconv.Atoi(at)
			}
			for _, rule := range strings.Fields(match[2]) {
				want[fixtureKey(relative, line, rule)] = true
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return want
}

func fixtureKey(file string, line int, rule string) string {
	return file + ":" + strconv.Itoa(line) + " " + rule
}

func reported(t *testing.T, root string) map[string]bool {
	t.Helper()
	project := false
	if err := configure(&project); err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, module := range modules(t, root) {
		for key := range moduleFindings(t, root, module) {
			got[key] = true
		}
	}
	return got
}

func modules(t *testing.T, root string) []string {
	t.Helper()
	var found []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err == nil && entry.Name() == "go.mod" {
			found = append(found, filepath.Dir(path))
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func moduleFindings(t *testing.T, root, module string) map[string]bool {
	t.Helper()
	t.Setenv("GOARCH", "386")
	result, err := analyze(module, options{}, []string{"./..."})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Errors) > 0 {
		t.Fatalf("fixtures in %s do not build: %s", module, strings.Join(result.Errors, "\n"))
	}
	got := map[string]bool{}
	for _, found := range result.Findings {
		relative, err := filepath.Rel(root, found.File)
		if err != nil {
			t.Fatal(err)
		}
		got[fixtureKey(relative, found.Line, found.Rule)] = true
	}
	return got
}

func differences(left, right map[string]bool) []string {
	var missing []string
	for key := range left {
		if !right[key] {
			missing = append(missing, key)
		}
	}
	slices.Sort(missing)
	return missing
}

func TestFixturesReportExactlyTheMarkedLines(t *testing.T) {
	root := fixtureRoot(t)
	want := wanted(t, root)
	got := reported(t, root)
	if missing, extra := differences(want, got), differences(got, want); len(missing)+len(extra) > 0 {
		t.Fatalf("missing:\n%s\nunexpected:\n%s", strings.Join(missing, "\n"), strings.Join(extra, "\n"))
	}
}

func TestEveryEnabledRuleHasAFailingFixture(t *testing.T) {
	covered := map[string]bool{}
	for key := range wanted(t, fixtureRoot(t)) {
		covered[key[strings.LastIndex(key, " ")+1:]] = true
	}
	var uncovered []string
	for _, analyzer := range analyzers() {
		rules := catalog.Checks(analyzer.Name)
		if rules == nil {
			rules = []string{ruleName(analyzer)}
		}
		for _, rule := range rules {
			if !covered[rule] {
				uncovered = append(uncovered, rule)
			}
		}
	}
	for _, each := range reviveRules() {
		if !covered[each.Name()] {
			uncovered = append(uncovered, each.Name())
		}
	}
	if len(uncovered) > 0 {
		t.Fatalf("rules without a fixture: %s", strings.Join(uncovered, " "))
	}
}
