package lifecycles

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var tickerAnalyzer = &analysis.Analyzer{
	Name:     "ticker_not_stopped",
	Doc:      "reports a time.NewTicker whose Stop is never called",
	Requires: support.Requires,
	Run:      runTicker,
}

const tickerMessage = "this ticker is never stopped, so it keeps firing and holds its timer after the owner is done: " +
	"keep it in a variable and `defer ticker.Stop()`, or call `Stop` on the field in `Close`. " +
	"An exception fits only when the ticker lives as long as the process"

func runTicker(pass *analysis.Pass) (any, error) {
	stopped := stoppedObjects(pass)
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if !support.IsFunc(pass.TypesInfo, call, "time", "NewTicker") || support.InTestFile(pass, call) {
			continue
		}
		owner, ownable := holder(pass, cursor.Parent().Node(), call)
		if !ownable {
			continue
		}
		if owner == nil || !stopped[owner] {
			pass.Reportf(call.Pos(), "%s", tickerMessage)
		}
	}
	return nil, nil
}

func holder(pass *analysis.Pass, parent ast.Node, call *ast.CallExpr) (types.Object, bool) {
	switch value := parent.(type) {
	case *ast.AssignStmt:
		for index, right := range value.Rhs {
			if right == call && index < len(value.Lhs) {
				return objectOf(pass, value.Lhs[index]), true
			}
		}
	case *ast.ValueSpec:
		for index, right := range value.Values {
			if right == call && index < len(value.Names) {
				return pass.TypesInfo.Defs[value.Names[index]], true
			}
		}
	case *ast.KeyValueExpr:
		return objectOf(pass, value.Key), true
	case *ast.SelectorExpr:
		return nil, true
	case *ast.ReturnStmt, *ast.CallExpr:
		return nil, false
	}
	return nil, false
}

func stoppedObjects(pass *analysis.Pass) map[types.Object]bool {
	stopped := map[types.Object]bool{}
	for cursor := range support.Root(pass).Preorder((*ast.SelectorExpr)(nil)) {
		selector := cursor.Node().(*ast.SelectorExpr)
		if selector.Sel.Name != "Stop" {
			continue
		}
		if object := objectOf(pass, selector.X); object != nil {
			stopped[object] = true
		}
	}
	for changed := true; changed; {
		changed = propagate(pass, stopped)
	}
	return stopped
}

func propagate(pass *analysis.Pass, stopped map[types.Object]bool) bool {
	changed := false
	mark := func(object types.Object) {
		if object != nil && !stopped[object] {
			stopped[object] = true
			changed = true
		}
	}
	for cursor := range support.Root(pass).Preorder((*ast.AssignStmt)(nil), (*ast.CallExpr)(nil)) {
		switch value := cursor.Node().(type) {
		case *ast.AssignStmt:
			markAliases(pass, value, stopped, mark)
		case *ast.CallExpr:
			markArguments(pass, value, stopped, mark)
		}
	}
	return changed
}

func markAliases(pass *analysis.Pass, assign *ast.AssignStmt, stopped map[types.Object]bool, mark func(types.Object)) {
	if len(assign.Lhs) != len(assign.Rhs) {
		return
	}
	for index, left := range assign.Lhs {
		if stopped[objectOf(pass, left)] {
			mark(objectOf(pass, assign.Rhs[index]))
		}
	}
}

func markArguments(pass *analysis.Pass, call *ast.CallExpr, stopped map[types.Object]bool, mark func(types.Object)) {
	callee, ok := calleeOf(pass, call).(*types.Func)
	if !ok {
		return
	}
	parameters := callee.Type().(*types.Signature).Params()
	for index, argument := range call.Args {
		if index < parameters.Len() && stopped[parameters.At(index)] {
			mark(objectOf(pass, argument))
		}
	}
}
