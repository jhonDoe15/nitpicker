package overflow

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var builtinSinks = []string{"make", "min", "max"}

func resultUsed(pass *analysis.Pass, cursor cursorOf) bool {
	return sinkContext(pass, cursor, true)
}

func sinkContext(pass *analysis.Pass, cursor cursorOf, stored bool) bool {
	parent := cursor.Parent()
	for {
		if _, parenthesised := parent.Node().(*ast.ParenExpr); !parenthesised {
			break
		}
		cursor, parent = parent, parent.Parent()
	}
	switch outer := parent.Node().(type) {
	case *ast.IndexExpr:
		return outer.Index == cursor.Node()
	case *ast.SliceExpr:
		return outer.Low == cursor.Node() || outer.High == cursor.Node() || outer.Max == cursor.Node()
	case *ast.BinaryExpr:
		return comparison(outer.Op) || arithmetic(outer.Op) && sinkContext(pass, parent, stored)
	case *ast.CallExpr:
		return builtinSink(pass, outer)
	case *ast.AssignStmt:
		return stored && len(outer.Lhs) == len(outer.Rhs) && storedAndUsed(pass, parent, outer, cursor.Node())
	case *ast.ValueSpec:
		return stored && storedInSpec(pass, parent, outer, cursor.Node())
	}
	return false
}

func arithmetic(operator token.Token) bool {
	return operator == token.ADD || operator == token.SUB || operator == token.MUL
}

func comparison(operator token.Token) bool {
	switch operator {
	case token.EQL, token.NEQ, token.LSS, token.LEQ, token.GTR, token.GEQ:
		return true
	}
	return false
}

func builtinSink(pass *analysis.Pass, call *ast.CallExpr) bool {
	for _, name := range builtinSinks {
		if support.IsBuiltin(pass.TypesInfo, call, name) {
			return true
		}
	}
	return false
}

func storedAndUsed(pass *analysis.Pass, cursor cursorOf, statement *ast.AssignStmt, value ast.Node) bool {
	for index, each := range statement.Rhs {
		if each == value {
			return targetUsed(pass, cursor, statement.Lhs[index])
		}
	}
	return false
}

func storedInSpec(pass *analysis.Pass, cursor cursorOf, spec *ast.ValueSpec, value ast.Node) bool {
	for index, each := range spec.Values {
		if each == value && index < len(spec.Names) {
			return identUsed(pass, cursor, spec.Names[index])
		}
	}
	return false
}

func targetUsed(pass *analysis.Pass, cursor cursorOf, target ast.Expr) bool {
	ident, ok := ast.Unparen(target).(*ast.Ident)
	return ok && identUsed(pass, cursor, ident)
}

func identUsed(pass *analysis.Pass, cursor cursorOf, name *ast.Ident) bool {
	object := pass.TypesInfo.ObjectOf(name)
	function, found := support.EnclosingFunc(cursor)
	if object == nil || !found {
		return false
	}
	for use := range function.Preorder((*ast.Ident)(nil)) {
		ident := use.Node().(*ast.Ident)
		if ident != name && pass.TypesInfo.Uses[ident] == object && sinkContext(pass, use, false) {
			return true
		}
	}
	return false
}

func guarded(pass *analysis.Pass, found carriers, cursor cursorOf, object types.Object) bool {
	function, hasFunction := support.EnclosingFunc(cursor)
	if object == nil || !hasFunction {
		return false
	}
	for each := range function.Preorder((*ast.BinaryExpr)(nil), (*ast.CallExpr)(nil)) {
		if each.Node().End() > cursor.Node().Pos() {
			continue
		}
		switch node := each.Node().(type) {
		case *ast.BinaryExpr:
			if comparison(node.Op) && boundCompared(pass, found, node, object) {
				return true
			}
		case *ast.CallExpr:
			if builtinClamp(pass, node) && mentions(pass, node, object) {
				return true
			}
		}
	}
	return false
}

func builtinClamp(pass *analysis.Pass, call *ast.CallExpr) bool {
	return support.IsBuiltin(pass.TypesInfo, call, "min") || support.IsBuiltin(pass.TypesInfo, call, "max")
}

func boundCompared(pass *analysis.Pass, found carriers, expr *ast.BinaryExpr, object types.Object) bool {
	left, right := mentions(pass, expr.X, object), mentions(pass, expr.Y, object)
	if left == right {
		return false
	}
	other := expr.Y
	if right {
		other = expr.X
	}
	return holdsMax(pass, found, other, pass.TypesInfo.TypeOf(expr.X)) || subtracts(other)
}

func subtracts(expr ast.Expr) bool {
	found := false
	ast.Inspect(expr, func(node ast.Node) bool {
		if binary, ok := node.(*ast.BinaryExpr); ok && binary.Op == token.SUB {
			found = true
		}
		return !found
	})
	return found
}

func mentions(pass *analysis.Pass, expr ast.Node, object types.Object) bool {
	found := false
	ast.Inspect(expr, func(node ast.Node) bool {
		if ident, ok := node.(*ast.Ident); ok && pass.TypesInfo.Uses[ident] == object {
			found = true
		}
		return !found
	})
	return found
}
