package lifecycles

import (
	"go/ast"
	"go/types"
	"slices"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var closeNames = []string{
	"Close", "Shutdown", "Stop", "Dispose", "Disconnect", "Teardown", "Cleanup", "Destroy", "Release",
}

var releaseNames = []string{
	"Close", "Shutdown", "Stop", "Disconnect", "Terminate", "Unsubscribe", "Dispose", "Destroy", "Release", "Quit",
}

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{cleanupAnalyzer, pendingAnalyzer}
}

func isCloseName(name string) bool {
	return slices.Contains(closeNames, name)
}

func releaseCall(info *types.Info, expression ast.Expr) *ast.CallExpr {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok {
		return nil
	}
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || !slices.Contains(releaseNames, selector.Sel.Name) {
		return nil
	}
	if _, isFunction := typeutil.Callee(info, call).(*types.Func); !isFunction {
		return nil
	}
	return call
}

func returnsError(info *types.Info, call *ast.CallExpr) bool {
	results, ok := info.TypeOf(call).(*types.Tuple)
	if ok {
		return results.Len() > 0 && isError(results.At(results.Len()-1).Type())
	}
	return isError(info.TypeOf(call))
}

func isError(typ types.Type) bool {
	return typ != nil && types.Identical(typ, types.Universe.Lookup("error").Type())
}
