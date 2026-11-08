package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const store = `package store

import (
	"fmt"
	shop "example.com/shop/money"
)

//export Hook
func Hook() {}

const Limit, label = 10, "x"

var cache = map[string]int{}

type Item struct {
	Name  string
	Price shop.Amount
}

func (item Item) Label() string {
	for Limit := 0; Limit < 1; Limit++ {
	}
	return fmt.Sprint(item.Name, helper(), label)
}
`

const helper = `package store

func helper() string { return Format(cache) }
`

func definitionLine(definition Definition) string {
	return strings.Join([]string{
		definition.File, definition.Name, definition.Kind,
		strings.Join(definition.Tokens, " "),
	}, " | ")
}

func TestListsTopLevelDefinitionsWithTheirTokens(t *testing.T) {
	report := inspected(t, map[string]string{"go.mod": "module example.com/shop\n", "store/store.go": store})
	var lines []string
	for _, definition := range report.Definitions {
		lines = append(lines, definitionLine(definition))
	}
	want := []string{
		"store/store.go | Hook | function | func Hook ( ) { }",
		"store/store.go | Limit | const | Limit , label = 10 , \"x\"",
		"store/store.go | label | const | Limit , label = 10 , \"x\"",
		"store/store.go | cache | const | cache = map [ string ] int { }",
		"store/store.go | Item | type | Item struct { Name string Price shop . Amount }",
	}
	if !reflect.DeepEqual(lines, want) {
		t.Fatalf("definitions:\n%s\nwant:\n%s", strings.Join(lines, "\n"), strings.Join(want, "\n"))
	}
	flags := []bool{report.Definitions[0].Entry, report.Definitions[1].Literal, report.Definitions[3].Literal}
	if !reflect.DeepEqual(flags, []bool{true, true, false}) {
		t.Fatalf("entry and literal flags: %v", flags)
	}
}

func TestListsTheNamesEachFileUses(t *testing.T) {
	report := inspected(t, map[string]string{
		"go.mod":          "module example.com/shop\n",
		"store/store.go":  store,
		"store/helper.go": helper,
	})
	data, err := json.Marshal(report.Usages)
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"file":"store/helper.go","imports":[],"names":["Format","cache","string"],"selectors":[],"local":[]},` +
		`{"file":"store/store.go","imports":[{"path":"fmt","name":"","line":4},{"path":"example.com/shop/money","name":"shop","line":5}],` +
		`"names":["fmt","helper","int","shop","string"],"selectors":[{"qualifier":"fmt","name":"Sprint"},{"qualifier":"shop","name":"Amount"}],` +
		`"local":["Item","label"]}]`
	if string(data) != want {
		t.Fatalf("usages:\n%s\nwant:\n%s", data, want)
	}
}

func TestMarksFilesThatOnlySomeBuildsCompile(t *testing.T) {
	report := inspected(t, map[string]string{
		"go.mod":                 "module example.com/shop\n",
		"a/plain.go":             "package a\n",
		"a/linux.go":             "package a\n",
		"a/poll_linux.go":        "package a\n",
		"a/poll_arm64.go":        "package a\n",
		"a/tagged.go":            "//go:build integration\n\npackage a\n",
		"a/poll_windows_test.go": "package a\n",
		"_scratch/x.go":          "package scratch\n",
		".cache/y.go":            "package cache\n",
		"tools/go.mod":           "module tools\n",
		"tools/t.go":             "package tools\n",
	})
	var constrained []string
	for _, file := range report.Files {
		if file.Constrained {
			constrained = append(constrained, file.Path)
		}
	}
	want := []string{"a/poll_arm64.go", "a/poll_linux.go", "a/poll_windows_test.go", "a/tagged.go"}
	if !reflect.DeepEqual(constrained, want) {
		t.Fatalf("constrained %v, want %v", constrained, want)
	}
	if !reflect.DeepEqual(report.Skipped, []string{".cache", "_scratch", "tools"}) {
		t.Fatalf("skipped %v", report.Skipped)
	}
}

func TestListsNoDefinitionsOfAFileThatDoesNotParse(t *testing.T) {
	report := inspected(t, map[string]string{
		"go.mod":     "module example.com/shop\n",
		"lib/ok.go":  "package lib\n\nfunc Ok() {}\n",
		"lib/bad.go": "package lib\n\nfunc Fine() {}\n\nfunc Broken( {\n}\n",
	})
	var names []string
	for _, definition := range report.Definitions {
		names = append(names, definition.File+" "+definition.Name)
	}
	if !reflect.DeepEqual(names, []string{"lib/ok.go Ok"}) || len(report.Errors) == 0 {
		t.Fatalf("definitions %v, errors %v", names, report.Errors)
	}
}
