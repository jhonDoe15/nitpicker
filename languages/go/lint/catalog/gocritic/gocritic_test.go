package gocritic

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
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
	text := string(data)
	enabled := section(t, text, "- **go-critic**", "\n\n")
	disabled := section(t, text, "**go-critic checkers left out**", "\n\n**")
	var missing []string
	for _, each := range []struct {
		names []string
		text  string
	}{{Enabled, enabled}, {Disabled, disabled}} {
		for _, name := range each.names {
			if !regexp.MustCompile(`\b` + name + `\b`).MatchString(each.text) {
				missing = append(missing, name)
			}
		}
	}
	if len(missing) > 0 {
		t.Fatalf("docs/go-preset.md does not list in their place: %v", missing)
	}
}

func section(t *testing.T, text, start, end string) string {
	t.Helper()
	_, after, found := strings.Cut(text, start)
	if !found {
		t.Fatalf("docs/go-preset.md has no %q", start)
	}
	body, _, _ := strings.Cut(after, end)
	return body
}
