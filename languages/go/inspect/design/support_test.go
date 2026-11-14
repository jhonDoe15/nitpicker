package design

import (
	"encoding/json"
	"go/parser"
	"go/token"
	"sort"
	"testing"
)

const testModule = "example.com/shop"

func factsOf(t *testing.T, files map[string]string) Facts {
	t.Helper()
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	set := token.NewFileSet()
	var sources []Source
	for _, name := range names {
		syntax, err := parser.ParseFile(set, name, files[name], parser.ParseComments)
		if err != nil {
			t.Fatal(err)
		}
		sources = append(sources, Source{Path: name, Syntax: syntax, Set: set})
	}
	return Build(testModule, sources)
}

func callableNamed(t *testing.T, facts Facts, id string) Callable {
	t.Helper()
	for _, callable := range facts.Callables {
		if callable.ID == id {
			return callable
		}
	}
	t.Fatalf("no callable %s in %s", id, dump(facts))
	return Callable{}
}

func typeNamed(t *testing.T, facts Facts, id string) Type {
	t.Helper()
	for _, fact := range facts.Types {
		if fact.ID == id {
			return fact
		}
	}
	t.Fatalf("no type %s in %s", id, dump(facts))
	return Type{}
}

func dump(value any) string {
	data, _ := json.MarshalIndent(value, "", " ")
	return string(data)
}
