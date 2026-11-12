package main

import (
	"cmp"
	"errors"
	"fmt"
	"go/ast"
	"go/token"
	"maps"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/catalog"
	"golang.org/x/tools/go/analysis/checker"
	"golang.org/x/tools/go/packages"
)

type Finding struct {
	Tool    string `json:"tool"`
	Rule    string `json:"rule"`
	File    string `json:"file"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Message string `json:"message"`
}

type Result struct {
	Findings []Finding `json:"findings"`
	Errors   []string  `json:"errors"`
}

func supersededBy() map[string][]string {
	replacements := map[string][]string{
		"S1023":                     {"SA4011"},
		"S1000":                     {"S1037"},
		"inline":                    {"gofixdirective"},
		"rangeint":                  {"S1018"},
		"SA4006":                    {"SA4010"},
		"SA1006":                    {"printf"},
		"nilness":                   {"SA4031", "SA5000"},
		"errcheck":                  {"SA5001", "SA9001", "sqlclosecheck"},
		"nilnil":                    {"nilerr"},
		"wastedassign":              {"SA4006", "SA4010"},
		"usetesting":                {"testingcontext"},
		"compares":                  {"errorlint"},
		"suite-thelper":             {"thelper"},
		"errname":                   {"ST1012"},
		"noctx":                     {"SA1005"},
		"string-format":             {"SA1006", "QF1010", "QF1012", "S1025", "S1028", "S1039", "unnecessary-format"},
		"bool-format":               {"QF1012"},
		"hex-format":                {"QF1012"},
		"integer-format":            {"QF1012"},
		"gocheckcompilerdirectives": {"SA9009"},
		"usestdlibvars":             {"ST1013"},
		"bidichk":                   {"ST1018"},
	}
	maps.Copy(replacements, reviveSuperseded())
	return replacements
}

const packageCommentRule = "ST1000"

type options struct {
	tags    string
	project bool
}

func analyze(directory string, settings options, patterns []string) (Result, error) {
	config := &packages.Config{Mode: packages.LoadAllSyntax | packages.NeedModule, Dir: directory, Tests: true}
	if settings.tags != "" {
		config.BuildFlags = []string{"-tags=" + settings.tags}
	}
	loaded, err := packages.Load(config, patterns...)
	if err != nil {
		return Result{}, err
	}
	result := Result{Findings: []Finding{}, Errors: loadErrors(loaded)}
	catalog.Prepare(loaded)
	graph, err := checker.Analyze(append(analyzers(), vetAnalyzers()...), loaded, nil)
	if err != nil {
		return result, err
	}
	if err := actionErrors(graph, brokenPackages(loaded)); err != nil {
		return result, err
	}
	seen := map[Finding]bool{}
	names := toolNames()
	objects := unusedObjects{unused: map[string]Finding{}, used: map[string]bool{}}
	for action := range graph.All() {
		if !action.IsRoot {
			continue
		}
		for _, diagnostic := range action.Diagnostics {
			rule, message := catalog.Rule(action.Analyzer.Name, diagnostic)
			found := finding(action.Package.Fset, diagnostic.Pos, names[action.Analyzer.Name], rule)
			found.Message = message
			seen[found] = true
		}
		objects.add(action.Result)
	}
	for found := range objects.findings() {
		seen[found] = true
	}
	revived, err := reviveFindings(loaded)
	if err != nil {
		return result, err
	}
	for _, found := range revived {
		seen[found] = true
	}
	findings, err := selected(handWritten(kept(seen), sources(loaded)), settings.project)
	result.Findings = findings
	return result, err
}

func loadErrors(loaded []*packages.Package) []string {
	unique := map[string]bool{}
	packages.Visit(loaded, nil, func(pkg *packages.Package) {
		for _, problem := range pkg.Errors {
			unique[problem.Error()] = true
		}
	})
	return slices.Sorted(maps.Keys(unique))
}

func brokenPackages(loaded []*packages.Package) map[*packages.Package]bool {
	broken := map[*packages.Package]bool{}
	packages.Visit(loaded, nil, func(pkg *packages.Package) {
		broken[pkg] = len(pkg.Errors) > 0 || pkg.IllTyped
		for _, imported := range pkg.Imports {
			broken[pkg] = broken[pkg] || broken[imported]
		}
	})
	return broken
}

func actionErrors(graph *checker.Graph, broken map[*packages.Package]bool) error {
	unique := map[string]bool{}
	for action := range graph.All() {
		if action.Err != nil && !broken[action.Package] {
			unique[fmt.Sprintf("%s: %s: %v", action.Package.PkgPath, action.Analyzer.Name, action.Err)] = true
		}
	}
	if len(unique) == 0 {
		return nil
	}
	return errors.New(strings.Join(slices.Sorted(maps.Keys(unique)), "\n"))
}

type sourceFiles struct {
	generated   map[string]bool
	handWritten map[string]bool
}

func sources(loaded []*packages.Package) sourceFiles {
	files := sourceFiles{generated: map[string]bool{}, handWritten: map[string]bool{}}
	for _, pkg := range loaded {
		for _, file := range pkg.Syntax {
			name := pkg.Fset.Position(file.Package).Filename
			if ast.IsGenerated(file) {
				files.generated[name] = true
			} else {
				files.handWritten[filepath.Dir(name)] = true
			}
		}
	}
	return files
}

func handWritten(findings []Finding, files sourceFiles) []Finding {
	return slices.DeleteFunc(findings, func(found Finding) bool {
		if found.Rule == packageCommentRule {
			return !files.handWritten[filepath.Dir(found.File)]
		}
		return files.generated[found.File]
	})
}

func selected(findings []Finding, project bool) ([]Finding, error) {
	if !project {
		return findings, nil
	}
	checks := projectChecks{}
	chosen := []Finding{}
	for _, found := range findings {
		enabled, err := checks.enabled(found)
		if err != nil {
			return nil, err
		}
		if enabled {
			chosen = append(chosen, found)
		}
	}
	return chosen, nil
}

func finding(files *token.FileSet, at token.Pos, tool, rule string) Finding {
	place := files.Position(at)
	if tool == "" {
		tool = vetTool
	}
	return Finding{Tool: tool, Rule: rule, File: place.Filename, Line: place.Line, Column: place.Column}
}

func kept(seen map[Finding]bool) []Finding {
	rulesAt := map[string]map[string]bool{}
	for found := range seen {
		for _, key := range []string{lineKey(found), columnKey(found)} {
			if rulesAt[key] == nil {
				rulesAt[key] = map[string]bool{}
			}
			rulesAt[key][found.Rule] = true
		}
	}
	findings := []Finding{}
	replacements := supersededBy()
	byColumn := reviveSupersededByColumn()
	for found := range seen {
		key := lineKey(found)
		if byColumn[found.Rule] {
			key = columnKey(found)
		}
		if found.Tool != vetTool && !superseded(found, rulesAt[key], replacements) {
			findings = append(findings, found)
		}
	}
	slices.SortFunc(findings, func(left, right Finding) int {
		return cmp.Or(cmp.Compare(left.File, right.File), cmp.Compare(left.Line, right.Line),
			cmp.Compare(left.Column, right.Column), cmp.Compare(left.Rule, right.Rule),
			cmp.Compare(left.Message, right.Message))
	})
	return findings
}

func lineKey(found Finding) string {
	return found.File + ":" + strconv.Itoa(found.Line)
}

func columnKey(found Finding) string {
	return lineKey(found) + ":" + strconv.Itoa(found.Column)
}

func superseded(found Finding, rules map[string]bool, replacements map[string][]string) bool {
	for _, other := range replacements[found.Rule] {
		if rules[other] {
			return true
		}
	}
	return false
}
