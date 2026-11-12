package honesty

import (
	"go/ast"
	"go/constant"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var reasonAnalyzer = &analysis.Analyzer{
	Name:     "skipped_test_without_reason",
	Doc:      "reports a test skip that gives no reason",
	Requires: support.Requires,
	Run:      runReasons,
}

var switchedOffAnalyzer = &analysis.Analyzer{
	Name:     "switched_off_test",
	Doc:      "reports a test that always skips",
	Requires: support.Requires,
	Run:      runSwitchedOff,
}

const (
	reasonMessage = "a skip without a reason leaves the next reader guessing whether the test may run again: " +
		"say why, `t.Skip(\"needs docker: set DOCKER_HOST\")`"
	switchedOffMessage = "this test always skips, so it checks nothing: run it, delete it, " +
		"or skip only on a real condition (`if testing.Short()`, a missing tool or environment variable)"
)

func runReasons(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) && testingMethod(pass.TypesInfo, call, skips) && !reasoned(pass.TypesInfo, call) {
			pass.Reportf(call.Pos(), "%s", reasonMessage)
		}
	}
	return nil, nil
}

func reasoned(info *types.Info, call *ast.CallExpr) bool {
	if len(call.Args) == 0 {
		return false
	}
	value := info.Types[call.Args[0]].Value
	return value == nil || value.Kind() != constant.String || constant.StringVal(value) != "" || len(call.Args) > 1
}

func runSwitchedOff(pass *analysis.Pass) (any, error) {
	for _, found := range testFiles(pass) {
		for _, test := range found.tests {
			switchedOff(pass, test.Body.List)
		}
		for literal := range found.subtests {
			switchedOff(pass, literal.Body.List)
		}
	}
	return nil, nil
}

func switchedOff(pass *analysis.Pass, statements []ast.Stmt) {
	for _, statement := range statements {
		if skip := alwaysSkips(pass.TypesInfo, statement); skip != nil {
			pass.Reportf(skip.Pos(), "%s", switchedOffMessage)
			return
		}
	}
}

func alwaysSkips(info *types.Info, statement ast.Stmt) ast.Node {
	switch each := statement.(type) {
	case *ast.ExprStmt:
		if call, ok := ast.Unparen(each.X).(*ast.CallExpr); ok && testingMethod(info, call, skips) {
			return call
		}
	case *ast.IfStmt:
		if each.Init == nil && constantTrue(info, each.Cond) {
			for _, inner := range each.Body.List {
				if skip := alwaysSkips(info, inner); skip != nil {
					return skip
				}
			}
		}
	}
	return nil
}

func constantTrue(info *types.Info, condition ast.Expr) bool {
	value := info.Types[condition].Value
	return value != nil && value.Kind() == constant.Bool && constant.BoolVal(value)
}
