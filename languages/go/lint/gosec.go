package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/token"
	"go/version"
	"log"
	"maps"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/securego/gosec/v2"
	gosecanalyzers "github.com/securego/gosec/v2/analyzers"
	"github.com/securego/gosec/v2/issue"
	"github.com/securego/gosec/v2/rules"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/buildssa"
	"golang.org/x/tools/go/packages"
)

const (
	gosecTool         = "gosec"
	gosecVersionKey   = "GOSECGOVERSION"
	rangeAliasRule    = "G601"
	perIterationLoops = "go1.22"
)

var progressLines = []string{"Checking package:", "Checking file:", "Ignoring generated file:"}

var gosecAnalyzer = &analysis.Analyzer{
	Name:     gosecTool,
	Doc:      "gosec security rules, one diagnostic category per rule",
	Run:      runGosec,
	Requires: []*analysis.Analyzer{buildssa.Analyzer},
}

func gosecDisabled() map[string]bool {
	return map[string]bool{"G104": true, "G107": true, "G204": true, "G304": true, "G504": true}
}

func fileModes() map[string]string {
	return map[string]string{"G301": "0750", "G302": "0600", "G306": "0600", "G307": "0600"}
}

func gosecRules() []string {
	off := gosecDisabled()
	var ids []string
	for id := range rules.Generate(false).Rules {
		ids = append(ids, id)
	}
	for id := range gosecanalyzers.Generate(false).Analyzers {
		ids = append(ids, id)
	}
	return slices.Sorted(slices.Values(slices.DeleteFunc(ids, func(id string) bool { return off[id] })))
}

func gosecConfigure() error {
	return os.Setenv(gosecVersionKey, "1.21.0")
}

func runGosec(pass *analysis.Pass) (any, error) {
	var logged bytes.Buffer
	config := gosec.NewConfig()
	config.SetGlobal(gosec.Nosec, "true")
	for rule, mode := range fileModes() {
		config.Set(rule, mode)
	}
	checker := gosec.NewAnalyzer(config, true, false, false, 1, log.New(&logged, "", 0))
	excluded := slices.Collect(maps.Keys(gosecDisabled()))
	ruleList := rules.Generate(false, rules.NewRuleFilter(true, excluded...))
	checker.LoadRules(ruleList.RulesInfo())
	analyzerList := gosecanalyzers.Generate(false, gosecanalyzers.NewAnalyzerFilter(true, excluded...))
	checker.LoadAnalyzers(analyzerList.AnalyzersInfo())
	pkg := passPackage(pass)
	checker.CheckRules(pkg)
	checker.CheckAnalyzersWithSSA(pkg, pass.ResultOf[buildssa.Analyzer].(*buildssa.SSA))
	if failed := failures(logged.String()); failed != "" {
		return nil, fmt.Errorf("gosec: %s", failed)
	}
	found, _, parseErrors := checker.Report()
	if len(parseErrors) > 0 {
		return nil, fmt.Errorf("gosec: %v", parseErrors)
	}
	for _, each := range found {
		report(pass, each)
	}
	return nil, nil
}

func failures(logged string) string {
	var failed []string
	for line := range strings.Lines(logged) {
		if !slices.ContainsFunc(progressLines, func(prefix string) bool { return strings.HasPrefix(line, prefix) }) {
			failed = append(failed, strings.TrimSpace(line))
		}
	}
	return strings.Join(failed, "; ")
}

func passPackage(pass *analysis.Pass) *packages.Package {
	names := make([]string, len(pass.Files))
	for index, file := range pass.Files {
		names[index] = pass.Fset.File(file.Pos()).Name()
	}
	return &packages.Package{
		Name: pass.Pkg.Name(), Fset: pass.Fset, Syntax: pass.Files, CompiledGoFiles: names,
		Types: pass.Pkg, TypesInfo: pass.TypesInfo, TypesSizes: pass.TypesSizes,
	}
}

func report(pass *analysis.Pass, found *issue.Issue) {
	file := fileNamed(pass, found.File)
	if file == nil || found.RuleID == rangeAliasRule && perIteration(pass, file) {
		return
	}
	pass.Report(analysis.Diagnostic{
		Pos:      position(pass.Fset.File(file.Pos()), found),
		Category: found.RuleID,
		Message:  found.What,
	})
}

func fileNamed(pass *analysis.Pass, name string) *ast.File {
	for _, file := range pass.Files {
		if pass.Fset.File(file.Pos()).Name() == name {
			return file
		}
	}
	return nil
}

func perIteration(pass *analysis.Pass, file *ast.File) bool {
	fileVersion := pass.TypesInfo.FileVersions[file]
	return fileVersion == "" || version.Compare(fileVersion, perIterationLoops) >= 0
}

func position(file *token.File, found *issue.Issue) token.Pos {
	first, _, _ := strings.Cut(found.Line, "-")
	line, err := strconv.Atoi(first)
	if err != nil {
		return token.Pos(file.Base())
	}
	start, startColumn := lineStart(file, line)
	column, err := strconv.Atoi(found.Col)
	if err != nil || column < startColumn {
		return start
	}
	return min(start+token.Pos(column-startColumn), token.Pos(file.Base()+file.Size()))
}

func lineStart(file *token.File, line int) (token.Pos, int) {
	candidates := []int{line}
	for raw := range file.LineCount() {
		candidates = append(candidates, raw+1)
	}
	for _, raw := range candidates {
		if raw < 1 || raw > file.LineCount() {
			continue
		}
		start := file.LineStart(raw)
		if place := file.Position(start); place.Line == line {
			return start, place.Column
		}
	}
	return token.Pos(file.Base()), 1
}
