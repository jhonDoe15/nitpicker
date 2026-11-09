package main

import (
	"testing"

	"golang.org/x/tools/go/packages"
)

func TestBrokenPackagesIncludeTheirImporters(t *testing.T) {
	broken := &packages.Package{PkgPath: "broken", Errors: []packages.Error{{Msg: "undefined: x"}}}
	importer := &packages.Package{PkgPath: "importer", Imports: map[string]*packages.Package{"broken": broken}}
	clean := &packages.Package{PkgPath: "clean"}
	got := brokenPackages([]*packages.Package{importer, clean})
	want := map[*packages.Package]bool{broken: true, importer: true, clean: false}
	if len(got) != len(want) {
		t.Fatalf("brokenPackages() = %v, want %v", got, want)
	}
	for pkg, value := range want {
		if got[pkg] != value {
			t.Errorf("brokenPackages()[%s] = %v, want %v", pkg.PkgPath, got[pkg], value)
		}
	}
}
