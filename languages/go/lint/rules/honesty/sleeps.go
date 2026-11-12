package honesty

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var sleepAnalyzer = &analysis.Analyzer{
	Name:     "sleep_in_test",
	Doc:      "reports a test that sleeps",
	Requires: support.Requires,
	Run:      runSleeps,
}

const sleepMessage = "a test that sleeps waits a guessed time, so it is slow, and flaky when the guess is short: " +
	"wait for the event itself (a channel, `sync.WaitGroup`, a callback), or run the code in a " +
	"`testing/synctest` bubble, where time is virtual"

func runSleeps(pass *analysis.Pass) (any, error) {
	bodies := map[ast.Node]bool{}
	for _, found := range testFiles(pass) {
		for function := range found.judged {
			bodies[function] = true
		}
		for literal := range found.subtests {
			bodies[literal] = true
		}
	}
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if !sleeps(pass.TypesInfo, cursor, call) {
			continue
		}
		if function, found := support.EnclosingFunc(cursor); found && bodies[function.Node()] {
			pass.Reportf(call.Pos(), "%s", sleepMessage)
		}
	}
	return nil, nil
}

func sleeps(info *types.Info, cursor inspector.Cursor, call *ast.CallExpr) bool {
	if len(call.Args) != 1 || zero(info, call.Args[0]) {
		return false
	}
	if support.IsFunc(info, call, "time", "Sleep") {
		return true
	}
	if !support.IsFunc(info, call, "time", "After") {
		return false
	}
	receive, ok := cursor.Parent().Node().(*ast.UnaryExpr)
	if !ok || receive.Op != token.ARROW {
		return false
	}
	_, statement := cursor.Parent().Parent().Node().(*ast.ExprStmt)
	return statement
}

func zero(info *types.Info, duration ast.Expr) bool {
	value := info.Types[duration].Value
	return value != nil && (value.Kind() == constant.Int || value.Kind() == constant.Float) && constant.Sign(value) == 0
}
