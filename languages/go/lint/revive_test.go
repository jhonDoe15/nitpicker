package main

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/mgechev/revive/config"
)

func reviveOff() map[string]string {
	return map[string]string{
		"add-constant":                  "flags every literal but 0 and 1",
		"argument-limit":                "shared parameter limit",
		"atomic":                        "vet atomic",
		"banned-characters":             "needs a project list",
		"cognitive-complexity":          "shared structure limits and CRAP",
		"comments-density":              "needs a project threshold",
		"confusing-naming":              "reports whichever name revive reads last",
		"constant-logical-expr":         "SA4000",
		"context-keys-type":             "SA1029",
		"cyclomatic":                    "shared structure limits and CRAP",
		"dot-imports":                   "ST1001",
		"duplicated-imports":            "ST1019",
		"empty-lines":                   "formatter",
		"error-naming":                  "ST1012",
		"error-return":                  "ST1008",
		"error-strings":                 "ST1005",
		"errorf":                        "S1028",
		"exported":                      "ST1020 to ST1022",
		"file-header":                   "needs a project header",
		"file-length-limit":             "shared file limit",
		"function-length":               "shared function limits",
		"function-result-limit":         "size limit",
		"identical-ifelseif-conditions": "SA4014",
		"imports-blocklist":             "needs a project list",
		"line-length-limit":             "shared line limit",
		"max-control-nesting":           "shared nesting limit",
		"max-public-structs":            "size limit",
		"modifies-parameter":            "below the confidence floor",
		"optimize-operands-order":       "below the confidence floor",
		"package-comments":              "ST1000",
		"range":                         "S1005",
		"range-val-in-closure":          "vet loopclosure",
		"receiver-naming":               "ST1006 and ST1016",
		"redundant-build-tag":           "modernize plusbuild",
		"string-format":                 "needs project patterns",
		"string-of-int":                 "vet stringintconv",
		"time-naming":                   "ST1011",
		"unchecked-type-assertion":      "errcheck",
		"unconditional-recursion":       "SA5007",
		"unhandled-error":               "errcheck",
		"unreachable-code":              "vet unreachable",
		"unsecure-url-scheme":           "flags identifiers such as XML namespaces",
		"use-any":                       "modernize any",
		"use-errors-new":                "unnecessary-format",
		"use-slices-concat":             "not nil-preserving, like modernize appendclipped",
		"use-slices-sort":               "modernize slicessort",
		"use-waitgroup-go":              "modernize waitgroup",
		"var-naming":                    "ST1003",
		"waitgroup-by-value":            "vet copylocks",
	}
}

func TestEveryReviveRuleIsOnOrOff(t *testing.T) {
	decided := map[string]int{}
	for _, each := range reviveRules() {
		decided[each.Name()]++
	}
	for name := range reviveOff() {
		decided[name]++
	}
	var wrong []string
	for _, each := range config.AllRules() {
		if decided[each.Name()] != 1 {
			wrong = append(wrong, each.Name())
		}
		delete(decided, each.Name())
	}
	for name := range decided {
		wrong = append(wrong, name)
	}
	if len(wrong) > 0 {
		slices.Sort(wrong)
		t.Fatalf("revive rules not exactly once on or off, or unknown: %s", strings.Join(wrong, " "))
	}
}

func TestReviveDirectivesAreIgnored(t *testing.T) {
	path := t.TempDir() + "/directives.go"
	source := "package p\n\n//revive:disable\n// revive:enable-line:bare-return\nvar url = \"//x\"\n"
	if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
		t.Fatal(err)
	}
	read, err := withoutDirectives(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "package p\n\n//review:disable\n// review:enable-line:bare-return\nvar url = \"//x\"\n"
	if string(read) != want {
		t.Fatalf("got %q", read)
	}
}
