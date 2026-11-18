package negativecount

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "negative_count",
	Doc:      "reports a subtraction passed as a count to Repeat, make or Grow without a non-negative guard",
	Requires: support.Requires,
	Run:      run,
}

const message = "`%s` panics for a negative count, and `%s` is negative when the right side is larger: " +
	"guard it first (`if pad := %s; pad > 0 { ... }`) or clamp it with `max(0, ...)`"

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) {
			continue
		}
		name, count := sink(pass, call)
		if count == nil {
			continue
		}
		subtraction := subtractionOf(pass, cursor, count)
		if subtraction == nil || remainingSpace(name, subtraction) || guarded(cursor, site{call, subtraction, count}) {
			continue
		}
		text := types.ExprString(subtraction)
		pass.Reportf(call.Pos(), message, name, text, text)
	}
	return nil, nil
}

func sink(pass *analysis.Pass, call *ast.CallExpr) (string, ast.Expr) {
	switch {
	case support.IsFunc(pass.TypesInfo, call, "strings", "Repeat") && len(call.Args) == 2:
		return "strings.Repeat", call.Args[1]
	case support.IsFunc(pass.TypesInfo, call, "bytes", "Repeat") && len(call.Args) == 2:
		return "bytes.Repeat", call.Args[1]
	case support.IsFunc(pass.TypesInfo, call, "slices", "Grow") && len(call.Args) == 2:
		return "slices.Grow", call.Args[1]
	case support.IsBuiltin(pass.TypesInfo, call, "make") && len(call.Args) >= 2:
		if _, isSlice := types.Unalias(pass.TypesInfo.TypeOf(call.Args[0])).Underlying().(*types.Slice); isSlice {
			return "make", call.Args[len(call.Args)-1]
		}
	}
	return "", nil
}

func remainingSpace(name string, subtraction *ast.BinaryExpr) bool {
	call, ok := ast.Unparen(subtraction.X).(*ast.CallExpr)
	if !ok || name != "make" {
		return false
	}
	ident, isIdent := call.Fun.(*ast.Ident)
	return isIdent && ident.Name == "len"
}

func signed(pass *analysis.Pass, expression ast.Expr) bool {
	basic, ok := types.Unalias(pass.TypesInfo.TypeOf(expression)).Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsInteger != 0 && basic.Info()&types.IsUnsigned == 0
}

func findSubtraction(pass *analysis.Pass, expression ast.Expr) *ast.BinaryExpr {
	binary, ok := ast.Unparen(expression).(*ast.BinaryExpr)
	if !ok || pass.TypesInfo.Types[expression].Value != nil || !signed(pass, binary) {
		return nil
	}
	switch binary.Op {
	case token.SUB:
		if pass.TypesInfo.Types[binary.Y].Value != nil {
			return nil
		}
		return binary
	case token.ADD:
		if found := findSubtraction(pass, binary.X); found != nil {
			return found
		}
		return findSubtraction(pass, binary.Y)
	}
	return nil
}

func singleOrigin(pass *analysis.Pass, function inspector.Cursor, object types.Object) ast.Expr {
	var origin ast.Expr
	assignments := 0
	ast.Inspect(function.Node(), func(node ast.Node) bool {
		assign, isAssign := node.(*ast.AssignStmt)
		if !isAssign || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for index, left := range assign.Lhs {
			if named, isIdent := left.(*ast.Ident); isIdent && objectOf(pass, named) == object {
				assignments++
				origin = assign.Rhs[index]
			}
		}
		return true
	})
	if assignments != 1 {
		return nil
	}
	return origin
}

func subtractionOf(pass *analysis.Pass, cursor inspector.Cursor, count ast.Expr) *ast.BinaryExpr {
	if found := findSubtraction(pass, count); found != nil {
		return found
	}
	ident, ok := ast.Unparen(count).(*ast.Ident)
	if !ok {
		return nil
	}
	function, ok := support.EnclosingFunc(cursor)
	if !ok {
		return nil
	}
	origin := singleOrigin(pass, function, pass.TypesInfo.Uses[ident])
	if origin == nil {
		return nil
	}
	return findSubtraction(pass, origin)
}

func identNames(expression ast.Node) map[string]bool {
	names := map[string]bool{}
	ast.Inspect(expression, func(node ast.Node) bool {
		if ident, ok := node.(*ast.Ident); ok {
			names[ident.Name] = true
		}
		return true
	})
	return names
}

func mentionsAll(condition ast.Node, subtraction *ast.BinaryExpr) bool {
	mentioned := identNames(condition)
	for name := range identNames(subtraction) {
		if !mentioned[name] {
			return false
		}
	}
	return true
}

func isRelation(operator token.Token) bool {
	return operator == token.LSS || operator == token.GTR || operator == token.LEQ || operator == token.GEQ
}

func relates(condition ast.Expr, subtraction *ast.BinaryExpr, count ast.Expr) bool {
	found := false
	ast.Inspect(condition, func(node ast.Node) bool {
		binary, ok := node.(*ast.BinaryExpr)
		if !ok || !isRelation(binary.Op) {
			return true
		}
		named := false
		if ident, isIdent := ast.Unparen(count).(*ast.Ident); isIdent {
			named = strings.Contains(types.ExprString(binary), ident.Name)
		}
		found = found || named || mentionsAll(binary, subtraction)
		return true
	})
	return found
}

func leaves(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.ReturnStmt, *ast.BranchStmt:
			found = true
		case *ast.CallExpr:
			if ident, ok := statement.Fun.(*ast.Ident); ok && ident.Name == "panic" {
				found = true
			}
		}
		return !found
	})
	return found
}

type site struct {
	call        *ast.CallExpr
	subtraction *ast.BinaryExpr
	count       ast.Expr
}

func within(block ast.Node, call *ast.CallExpr) bool {
	return block.Pos() <= call.Pos() && call.End() <= block.End()
}

func objectOf(pass *analysis.Pass, ident *ast.Ident) types.Object {
	if object := pass.TypesInfo.Defs[ident]; object != nil {
		return object
	}
	return pass.TypesInfo.Uses[ident]
}

func guarded(cursor inspector.Cursor, at site) bool {
	for each := range cursor.Enclosing((*ast.IfStmt)(nil), (*ast.BlockStmt)(nil)) {
		switch node := each.Node().(type) {
		case *ast.IfStmt:
			branch := within(node.Body, at.call) || (node.Else != nil && within(node.Else, at.call))
			if branch && relates(node.Cond, at.subtraction, at.count) {
				return true
			}
		case *ast.BlockStmt:
			if exitedBefore(node, at) {
				return true
			}
		}
	}
	return false
}

func exitedBefore(block *ast.BlockStmt, at site) bool {
	for _, statement := range block.List {
		branch, ok := statement.(*ast.IfStmt)
		if ok && branch.End() <= at.call.Pos() && leaves(branch.Body) && relates(branch.Cond, at.subtraction, at.count) {
			return true
		}
	}
	return false
}
