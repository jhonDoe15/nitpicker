package gocritic

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"testing"
)

func TestEveryCheckerIsDecidedOnce(t *testing.T) {
	if err := Configure(); err != nil {
		t.Fatal(err)
	}
	both := slices.Concat(Enabled, Disabled)
	slices.Sort(both)
	if compacted := slices.Compact(slices.Clone(both)); len(compacted) != len(both) {
		t.Fatalf("a checker is listed twice: %v", both)
	}
	if len(selected) != len(Enabled) {
		t.Fatalf("selected %d checkers, want %d", len(selected), len(Enabled))
	}
}

func TestTheDocsNameEveryChecker(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "docs", "go-preset.md"))
	if err != nil {
		t.Fatal(err)
	}
	var missing []string
	for _, name := range slices.Concat(Enabled, Disabled) {
		if !regexp.MustCompile(`\b` + name + `\b`).Match(data) {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("docs/go-preset.md does not name: %v", missing)
	}
}
