package honesty

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var unassertedAnalyzer = &analysis.Analyzer{
	Name:     "test_without_assertion",
	Doc:      "reports a test that never fails on its own",
	Requires: support.Requires,
	Run:      runUnasserted,
}

const unassertedMessage = "`%s` has no assertion, so it passes whatever the code does: check the result " +
	"(`if got != want { t.Errorf(...) }`, testify `assert`/`require`) or hand `t` to a helper that does"

func runUnasserted(pass *analysis.Pass) (any, error) {
	for _, found := range testFiles(pass) {
		for _, test := range found.tests {
			if !acts(pass.TypesInfo, test) {
				pass.Reportf(test.Name.Pos(), unassertedMessage, test.Name.Name)
			}
		}
	}
	return nil, nil
}

func acts(info *types.Info, test *ast.FuncDecl) bool {
	receiver := receiverObject(info, test)
	found := false
	ast.Inspect(test.Body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || found {
			return !found
		}
		found = isAssertion(info, call) || testingMethod(info, call, skips) || handsOverTesting(info, call) ||
			callsReceiver(info, call, receiver)
		return !found
	})
	return found
}

func handsOverTesting(info *types.Info, call *ast.CallExpr) bool {
	for _, argument := range call.Args {
		if testingValue(info, argument) {
			return true
		}
	}
	return false
}

func receiverObject(info *types.Info, function *ast.FuncDecl) types.Object {
	if function.Recv == nil || len(function.Recv.List[0].Names) == 0 {
		return nil
	}
	return info.Defs[function.Recv.List[0].Names[0]]
}

func callsReceiver(info *types.Info, call *ast.CallExpr, receiver types.Object) bool {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || receiver == nil {
		return false
	}
	ident, isIdent := ast.Unparen(selector.X).(*ast.Ident)
	method, isMethod := info.Uses[selector.Sel].(*types.Func)
	return isIdent && isMethod && info.Uses[ident] == receiver && method.Pkg() == receiver.Pkg()
}
