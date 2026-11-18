package lookups

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/ast/inspector"
)

func (found *finder) filledFromParameter(cursor inspector.Cursor, collection *ast.Ident) bool {
	function, ok := support.EnclosingDecl(cursor)
	if !ok {
		return false
	}
	parameters := map[types.Object]bool{}
	for _, field := range function.Type.Params.List {
		for _, name := range field.Names {
			parameters[found.pass.TypesInfo.Defs[name]] = true
		}
	}
	result := false
	ast.Inspect(function.Body, func(node ast.Node) bool {
		loop, isRange := node.(*ast.RangeStmt)
		source, isIdent := ast.Unparen(rangeSource(loop)).(*ast.Ident)
		if !isRange || !isIdent || !parameters[found.pass.TypesInfo.ObjectOf(source)] {
			return true
		}
		result = result || found.fillsFrom(loop, collection)
		return true
	})
	return result
}

func rangeSource(loop *ast.RangeStmt) ast.Expr {
	if loop == nil {
		return &ast.BadExpr{}
	}
	return loop.X
}

func (found *finder) fillsFrom(loop *ast.RangeStmt, collection *ast.Ident) bool {
	variables := map[types.Object]bool{}
	for _, each := range []ast.Expr{loop.Key, loop.Value} {
		if ident, ok := each.(*ast.Ident); ok && ident.Name != "_" {
			variables[found.pass.TypesInfo.ObjectOf(ident)] = true
		}
	}
	filled := false
	ast.Inspect(loop.Body, func(node ast.Node) bool {
		statement, ok := node.(*ast.AssignStmt)
		if !ok || len(statement.Lhs) != 1 || len(statement.Rhs) != 1 {
			return true
		}
		filled = filled || found.stores(statement, collection, variables)
		return true
	})
	return filled
}

func (found *finder) stores(statement *ast.AssignStmt, collection *ast.Ident, variables map[types.Object]bool) bool {
	if index, ok := statement.Lhs[0].(*ast.IndexExpr); ok && statement.Tok == token.ASSIGN {
		key, isIdent := index.Index.(*ast.Ident)
		return text(index.X) == collection.Name && isIdent && variables[found.pass.TypesInfo.ObjectOf(key)]
	}
	call, isCall := statement.Rhs[0].(*ast.CallExpr)
	if !isCall || !support.IsBuiltin(found.pass.TypesInfo, call, "append") || len(call.Args) != 2 {
		return false
	}
	added, isIdent := call.Args[1].(*ast.Ident)
	return text(statement.Lhs[0]) == collection.Name && isIdent && variables[found.pass.TypesInfo.ObjectOf(added)]
}

func (found *finder) filledCasing(cursor inspector.Cursor, collection, key ast.Expr) string {
	function, ok := support.EnclosingDecl(cursor)
	if !ok {
		return ""
	}
	switch key.(type) {
	case *ast.Ident, *ast.SelectorExpr:
	default:
		return ""
	}
	casing := ""
	ast.Inspect(function.Body, func(node ast.Node) bool {
		statement, isAssign := node.(*ast.AssignStmt)
		if !isAssign || len(statement.Lhs) != 1 || len(statement.Rhs) != 1 {
			return true
		}
		if value := found.filledKey(statement, collection); value != nil {
			if kind, inner, normalized := found.normalized(value); normalized && text(inner) == text(key) {
				casing = kind
			}
		}
		return true
	})
	return casing
}

func (found *finder) filledKey(statement *ast.AssignStmt, collection ast.Expr) ast.Expr {
	if index, ok := statement.Lhs[0].(*ast.IndexExpr); ok && text(index.X) == text(collection) {
		return index.Index
	}
	call, isCall := statement.Rhs[0].(*ast.CallExpr)
	isAppend := isCall && support.IsBuiltin(found.pass.TypesInfo, call, "append") && len(call.Args) == 2
	if isAppend && text(statement.Lhs[0]) == text(collection) {
		return call.Args[1]
	}
	return nil
}
