package domainmutation

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var sorters = map[string]map[string]bool{
	"sort": {
		"Ints": true, "Strings": true, "Float64s": true, "Slice": true, "SliceStable": true,
		"Sort": true, "Stable": true,
	},
	"slices": {"Sort": true, "SortFunc": true, "SortStableFunc": true, "Reverse": true},
}

func mutation(pass *analysis.Pass, node ast.Node, given map[types.Object]bool) (types.Object, string) {
	switch typed := node.(type) {
	case *ast.CallExpr:
		return callMutation(pass, typed, given)
	case *ast.AssignStmt:
		return indexWrite(pass, typed.Lhs, given)
	case *ast.IncDecStmt:
		return indexWrite(pass, []ast.Expr{typed.X}, given)
	}
	return nil, ""
}

func indexWrite(pass *analysis.Pass, targets []ast.Expr, given map[types.Object]bool) (types.Object, string) {
	for _, target := range targets {
		index, ok := ast.Unparen(target).(*ast.IndexExpr)
		if !ok {
			continue
		}
		object := objectOf(pass, ast.Unparen(index.X))
		if given[object] {
			return object, "a write into `" + object.Name() + "[...]`"
		}
	}
	return nil, ""
}

func callMutation(pass *analysis.Pass, call *ast.CallExpr, given map[types.Object]bool) (types.Object, string) {
	if len(call.Args) == 0 {
		return nil, ""
	}
	object := objectOf(pass, argument(pass, call.Args[0]))
	if object == nil || !given[object] {
		return nil, ""
	}
	if support.IsBuiltin(pass.TypesInfo, call, "copy") {
		return object, "`copy(" + object.Name() + ", ...)`"
	}
	if support.IsBuiltin(pass.TypesInfo, call, "append") {
		return object, "`append(" + object.Name() + ", ...)`"
	}
	if support.IsBuiltin(pass.TypesInfo, call, "delete") || support.IsBuiltin(pass.TypesInfo, call, "clear") {
		return object, "`" + builtinName(call) + "(" + object.Name() + ")`"
	}
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok || callee.Pkg() == nil || !sorters[callee.Pkg().Path()][callee.Name()] {
		return nil, ""
	}
	return object, "`" + callee.Pkg().Name() + "." + callee.Name() + "(" + object.Name() + ", ...)`"
}

func builtinName(call *ast.CallExpr) string {
	if ident, ok := ast.Unparen(call.Fun).(*ast.Ident); ok {
		return ident.Name
	}
	return ""
}

func argument(pass *analysis.Pass, expr ast.Expr) ast.Expr {
	expr = ast.Unparen(expr)
	if conversion, ok := expr.(*ast.CallExpr); ok && len(conversion.Args) == 1 {
		if tv, known := pass.TypesInfo.Types[conversion.Fun]; known && tv.IsType() {
			return ast.Unparen(conversion.Args[0])
		}
	}
	return expr
}
