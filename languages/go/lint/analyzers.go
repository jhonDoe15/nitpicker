package main

import (
	"github.com/jhonDoe15/nitpicker/languages/go/lint/catalog"
	"github.com/kisielk/errcheck/errcheck"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/deepequalerrors"
	"golang.org/x/tools/go/analysis/passes/gofix"
	"golang.org/x/tools/go/analysis/passes/httpmux"
	"golang.org/x/tools/go/analysis/passes/inline"
	"golang.org/x/tools/go/analysis/passes/modernize"
	"golang.org/x/tools/go/analysis/passes/nilness"
	"golang.org/x/tools/go/analysis/passes/reflectvaluecompare"
	"golang.org/x/tools/go/analysis/passes/scannererr"
	"golang.org/x/tools/go/analysis/passes/sqlrowserr"
	"golang.org/x/tools/go/analysis/passes/unusedwrite"
	"honnef.co/go/tools/analysis/lint"
	"honnef.co/go/tools/quickfix"
	"honnef.co/go/tools/simple"
	"honnef.co/go/tools/staticcheck"
	"honnef.co/go/tools/stylecheck"
	"honnef.co/go/tools/unused"
)

const (
	staticcheckTool = "staticcheck"
	modernizeTool   = "modernize"
)

type group struct {
	tool      string
	analyzers []*analysis.Analyzer
}

func disabled() map[string]bool {
	return map[string]bool{
		"SA1014": true, "SA1017": true, "SA2000": true, "SA2002": true, "SA4018": true, "SA4021": true,
		"SA5005": true, "SA5009": true, "SA5010": true, "SA9006": true, "S1029": true, "ST1023": true,
		"sqlrowserr": true,
	}
}

func passes() []*analysis.Analyzer {
	return []*analysis.Analyzer{
		deepequalerrors.Analyzer, gofix.Analyzer, httpmux.Analyzer, inline.Analyzer, nilness.Analyzer,
		reflectvaluecompare.Analyzer, scannererr.Analyzer, sqlrowserr.Analyzer, unusedwrite.Analyzer,
	}
}

func errcheckFlags() error {
	if err := errcheck.Analyzer.Flags.Set("blank", "true"); err != nil {
		return err
	}
	if err := errcheck.Analyzer.Flags.Set("assert", "true"); err != nil {
		return err
	}
	return catalog.Configure()
}

func staticcheckAnalyzers() []*analysis.Analyzer {
	var all []*analysis.Analyzer
	sets := [][]*lint.Analyzer{
		staticcheck.Analyzers, simple.Analyzers, stylecheck.Analyzers, quickfix.Analyzers, {unused.Analyzer},
	}
	for _, set := range sets {
		for _, analyzer := range set {
			all = append(all, analyzer.Analyzer)
		}
	}
	return all
}

func groups() []group {
	all := []group{
		{tool: staticcheckTool, analyzers: staticcheckAnalyzers()},
		{tool: "vet", analyzers: passes()},
		{tool: "errcheck", analyzers: []*analysis.Analyzer{errcheck.Analyzer}},
		{tool: modernizeTool, analyzers: modernize.Suite},
	}
	for _, linter := range catalog.Linters() {
		all = append(all, group{tool: linter.Tool, analyzers: linter.Analyzers})
	}
	return all
}

func analyzers() []*analysis.Analyzer {
	off := disabled()
	var selected []*analysis.Analyzer
	for _, each := range groups() {
		for _, analyzer := range each.analyzers {
			if !off[analyzer.Name] {
				selected = append(selected, analyzer)
			}
		}
	}
	return selected
}

func toolNames() map[string]string {
	names := map[string]string{}
	for _, each := range groups() {
		for _, analyzer := range each.analyzers {
			names[analyzer.Name] = each.tool
		}
	}
	return names
}
