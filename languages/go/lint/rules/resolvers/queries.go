package resolvers

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/remote"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

func queryOf(info *types.Info, function *ast.FuncDecl, parent *types.Var) *ast.CallExpr {
	derived := map[types.Object]bool{parent: true}
	var found *ast.CallExpr
	ast.Inspect(function.Body, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.AssignStmt:
			if mentions(info, each.Rhs, derived) {
				for _, target := range each.Lhs {
					taint(info, target, derived)
				}
			}
		case *ast.CallExpr:
			if found == nil && remote.IsCall(info, each) && mentions(info, chainArguments(each), derived) {
				found = each
			}
		}
		return found == nil
	})
	return found
}

func taint(info *types.Info, target ast.Expr, derived map[types.Object]bool) {
	ident, ok := target.(*ast.Ident)
	if !ok || info.ObjectOf(ident) == nil {
		return
	}
	typ := info.ObjectOf(ident).Type()
	if support.IsNamed(typ, "context", "Context") || types.Identical(typ, types.Universe.Lookup("error").Type()) {
		return
	}
	derived[info.ObjectOf(ident)] = true
}

func chainArguments(call *ast.CallExpr) []ast.Expr {
	arguments := slices.Clone(call.Args)
	for {
		selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
		if !ok {
			return arguments
		}
		inner, isCall := ast.Unparen(selector.X).(*ast.CallExpr)
		if !isCall {
			return arguments
		}
		arguments = append(arguments, inner.Args...)
		call = inner
	}
}

func mentions(info *types.Info, expressions []ast.Expr, derived map[types.Object]bool) bool {
	found := false
	for _, expression := range expressions {
		ast.Inspect(expression, func(node ast.Node) bool {
			if ident, ok := node.(*ast.Ident); ok && derived[info.Uses[ident]] {
				found = true
			}
			return !found
		})
	}
	return found
}

func usesLoader(info *types.Info, function *ast.FuncDecl) bool {
	found := false
	ast.Inspect(function.Body, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok {
			if selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr); isSelector {
				found = found || slices.Contains(loaderCalls, selector.Sel.Name) && loaderLike(info, selector.X)
			}
		}
		return !found
	})
	return found
}

func loaderLike(info *types.Info, receiver ast.Expr) bool {
	if typed, ok := types.Unalias(support.Deref(info.TypeOf(receiver))).(*types.Named); ok &&
		strings.Contains(strings.ToLower(typed.Obj().Name()), "loader") {
		return true
	}
	switch node := ast.Unparen(receiver).(type) {
	case *ast.Ident:
		return strings.Contains(strings.ToLower(node.Name), "loader")
	case *ast.SelectorExpr:
		return strings.Contains(strings.ToLower(node.Sel.Name), "loader")
	case *ast.CallExpr:
		return loaderLike(info, node.Fun)
	}
	return false
}
