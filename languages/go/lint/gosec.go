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
	analyzerFailure   = "Error running analyzer"
	strictFileMode    = "0600"
)

var gosecAnalyzer = &analysis.Analyzer{
	Name:     gosecTool,
	Doc:      "gosec security rules, one diagnostic category per rule",
	Run:      runGosec,
	Requires: []*analysis.Analyzer{buildssa.Analyzer},
}

func gosecDisabled() map[string]bool {
	return map[string]bool{"G104": true, "G107": true, "G204": true, "G304": true}
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
	config.Set("G307", strictFileMode)
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
	found, _, _ := checker.Report()
	for _, each := range found {
		report(pass, each)
	}
	return nil, nil
}

func failures(logged string) string {
	var failed []string
	for line := range strings.Lines(logged) {
		if strings.HasPrefix(line, analyzerFailure) {
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
	if err != nil || line < 1 || line > file.LineCount() {
		return token.Pos(file.Base())
	}
	start := file.LineStart(line)
	column, err := strconv.Atoi(found.Col)
	if err != nil || column < 1 {
		return start
	}
	return min(start+token.Pos(column-1), token.Pos(file.Base()+file.Size()))
}
