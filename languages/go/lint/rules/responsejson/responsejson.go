package responsejson

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "unchecked_response_json",
	Doc:      "reports an HTTP response body decoded as JSON before the response status is read",
	Requires: support.Requires,
	Run:      run,
}

const message = "the body of `%s` is decoded as JSON before `%s.StatusCode` is checked, so an error page from a " +
	"proxy or gateway fails as an opaque decode error and the real status is lost: check `%s.StatusCode` " +
	"(or `%s.Status`) first and return an error with it"

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if body := bodyOf(cursor.Node()); body != nil {
			check(pass, body)
		}
	}
	return nil, nil
}

func bodyOf(node ast.Node) *ast.BlockStmt {
	switch function := node.(type) {
	case *ast.FuncDecl:
		return function.Body
	case *ast.FuncLit:
		return function.Body
	}
	return nil
}

func isResponse(pass *analysis.Pass, ident *ast.Ident) bool {
	return support.IsNamed(pass.TypesInfo.TypeOf(ident), "net/http", "Response")
}

func responses(pass *analysis.Pass, body *ast.BlockStmt) map[types.Object]bool {
	found := map[types.Object]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || assign.Tok != token.DEFINE {
			return true
		}
		for _, left := range assign.Lhs {
			if ident, ok := left.(*ast.Ident); ok && pass.TypesInfo.Defs[ident] != nil && isResponse(pass, ident) {
				found[pass.TypesInfo.Defs[ident]] = true
			}
		}
		return true
	})
	return found
}

func bodyOwner(pass *analysis.Pass, expression ast.Expr, held map[types.Object]bool) *ast.Ident {
	selector, ok := ast.Unparen(expression).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Body" {
		return nil
	}
	owner, ok := selector.X.(*ast.Ident)
	if !ok || !held[pass.TypesInfo.Uses[owner]] {
		return nil
	}
	return owner
}

func decodeOf(pass *analysis.Pass, call *ast.CallExpr, held map[types.Object]bool) *ast.Ident {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Decode" {
		return nil
	}
	inner, ok := selector.X.(*ast.CallExpr)
	if !ok || len(inner.Args) != 1 || !support.IsFunc(pass.TypesInfo, inner, "encoding/json", "NewDecoder") {
		return nil
	}
	return bodyOwner(pass, inner.Args[0], held)
}

func checked(pass *analysis.Pass, body *ast.BlockStmt, owner *ast.Ident, before token.Pos) bool {
	object := pass.TypesInfo.Uses[owner]
	bodyUses := map[*ast.Ident]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		if selector, ok := node.(*ast.SelectorExpr); ok && selector.Sel.Name == "Body" {
			if ident, ok := selector.X.(*ast.Ident); ok {
				bodyUses[ident] = true
			}
		}
		return true
	})
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		ident, ok := node.(*ast.Ident)
		if ok && ident.Pos() < before && !bodyUses[ident] && pass.TypesInfo.Uses[ident] == object {
			found = true
		}
		return !found
	})
	return found
}

func check(pass *analysis.Pass, body *ast.BlockStmt) {
	held := responses(pass, body)
	if len(held) == 0 {
		return
	}
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		owner := decodeOf(pass, call, held)
		if owner != nil && !checked(pass, body, owner, call.Pos()) {
			pass.Reportf(call.Pos(), message, owner.Name, owner.Name, owner.Name, owner.Name)
		}
		return true
	})
}
