package jobs

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/remote"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "failing_item_stops_job",
	Doc:      "reports a scheduled or queue job whose loop stops at the first item that fails",
	Requires: support.Requires,
	Run:      run,
}

const message = "this job loop stops at the first item whose call fails, so every later item waits for the next " +
	"run, and never runs while the same item keeps failing: record the failure per item and `continue` (collect " +
	"them with `errors.Join` and return after the loop), enqueue one task per item, or batch the calls (see " +
	"`io-in-loop`). An exception fits only when the whole run should be retried together"

func run(pass *analysis.Pass) (any, error) {
	for _, function := range jobFunctions(pass) {
		body := functionBody(function)
		if body == nil || support.InTestFile(pass, function) {
			continue
		}
		ast.Inspect(body, func(node ast.Node) bool {
			switch each := node.(type) {
			case *ast.FuncLit:
				return false
			case *ast.RangeStmt:
				if overItems(pass.TypesInfo, each.X) && stopsAtFirstFailure(pass.TypesInfo, each.Body) {
					pass.Reportf(each.Pos(), "%s", message)
					return false
				}
			}
			return true
		})
	}
	return nil, nil
}

func functionBody(function ast.Node) *ast.BlockStmt {
	switch node := function.(type) {
	case *ast.FuncDecl:
		return node.Body
	case *ast.FuncLit:
		return node.Body
	}
	return nil
}

func overItems(info *types.Info, collection ast.Expr) bool {
	if _, literal := ast.Unparen(collection).(*ast.CompositeLit); literal {
		return false
	}
	if ident, ok := ast.Unparen(collection).(*ast.Ident); ok {
		variable, isVar := info.Uses[ident].(*types.Var)
		if isVar && variable.Parent() == variable.Pkg().Scope() {
			return false
		}
	}
	switch types.Unalias(info.TypeOf(collection)).Underlying().(type) {
	case *types.Slice, *types.Map:
		return true
	}
	return false
}

func stopsAtFirstFailure(info *types.Info, body *ast.BlockStmt) bool {
	failures := map[types.Object]bool{}
	collectFailures(info, body, failures)
	found := false
	var path []ast.Node
	ast.Inspect(body, func(node ast.Node) bool {
		if node == nil {
			path = path[:len(path)-1]
			return false
		}
		if _, literal := node.(*ast.FuncLit); literal {
			return false
		}
		path = append(path, node)
		if each, ok := node.(*ast.IfStmt); ok {
			found = found || failsTheRun(info, each, failures, path)
		}
		return !found
	})
	return found
}

func collectFailures(info *types.Info, body *ast.BlockStmt, failures map[types.Object]bool) {
	ast.Inspect(body, func(node ast.Node) bool {
		if _, literal := node.(*ast.FuncLit); literal {
			return false
		}
		assignment, ok := node.(*ast.AssignStmt)
		if !ok || !ioAssignment(info, assignment) {
			return true
		}
		for _, target := range assignment.Lhs {
			ident, isIdent := target.(*ast.Ident)
			if !isIdent {
				continue
			}
			if object := info.ObjectOf(ident); object != nil && isError(object.Type()) {
				failures[object] = true
			}
		}
		return true
	})
}

func ioAssignment(info *types.Info, assignment *ast.AssignStmt) bool {
	for _, value := range assignment.Rhs {
		call, ok := ast.Unparen(value).(*ast.CallExpr)
		if ok && remote.IsCall(info, call) {
			return true
		}
	}
	return false
}

func isError(typ types.Type) bool {
	return types.Identical(typ, types.Universe.Lookup("error").Type())
}
