package remote

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var timeoutAnalyzer = &analysis.Analyzer{
	Name:     "http_without_timeout",
	Doc:      "reports an outbound HTTP call or client without a timeout",
	Requires: support.Requires,
	Run:      runTimeout,
}

const timeoutMessage = "this HTTP client has no timeout, so a server that accepts the connection and never answers " +
	"blocks the call for good: build `&http.Client{Timeout: 10 * time.Second}` once and pass it in"

var defaultClientFunctions = []string{"Get", "Post", "Head", "PostForm"}

func runTimeout(pass *analysis.Pass) (any, error) {
	nodes := []ast.Node{(*ast.CallExpr)(nil), (*ast.SelectorExpr)(nil), (*ast.CompositeLit)(nil), (*ast.ValueSpec)(nil)}
	for cursor := range support.Root(pass).Preorder(nodes...) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if withoutTimeout(pass, cursor) {
			pass.Reportf(cursor.Node().Pos(), "%s", timeoutMessage)
		}
	}
	return nil, nil
}

func withoutTimeout(pass *analysis.Pass, cursor inspector.Cursor) bool {
	switch node := cursor.Node().(type) {
	case *ast.CallExpr:
		return defaultClientCall(pass.TypesInfo, node) || zeroClient(pass, cursor, node)
	case *ast.SelectorExpr:
		return defaultClient(pass.TypesInfo, node) && !configures(cursor)
	case *ast.CompositeLit:
		return isClient(pass.TypesInfo.TypeOf(node)) && !hasTimeout(pass.TypesInfo, node) &&
			!timeoutSetLater(pass, cursor, assignedTarget(cursor))
	case *ast.ValueSpec:
		return node.Values == nil && len(node.Names) == 1 && clientValue(pass.TypesInfo.TypeOf(node.Names[0])) &&
			!timeoutSetLater(pass, cursor, node.Names[0])
	}
	return false
}

func isClient(typ types.Type) bool {
	return typ != nil && support.IsNamed(typ, "net/http", "Client")
}

func clientValue(typ types.Type) bool {
	_, pointer := types.Unalias(typ).(*types.Pointer)
	return isClient(typ) && !pointer
}

func defaultClientCall(info *types.Info, call *ast.CallExpr) bool {
	for _, name := range defaultClientFunctions {
		if support.IsFunc(info, call, "net/http", name) {
			return true
		}
	}
	return false
}

func zeroClient(pass *analysis.Pass, cursor inspector.Cursor, call *ast.CallExpr) bool {
	return support.IsBuiltin(pass.TypesInfo, call, "new") && len(call.Args) == 1 &&
		isClient(pass.TypesInfo.TypeOf(call.Args[0])) && !timeoutSetLater(pass, cursor, assignedTarget(cursor))
}

func defaultClient(info *types.Info, selector *ast.SelectorExpr) bool {
	variable, ok := info.Uses[selector.Sel].(*types.Var)
	return ok && variable.Pkg() != nil && variable.Pkg().Path() == "net/http" && variable.Name() == "DefaultClient"
}

func configures(cursor inspector.Cursor) bool {
	node := cursor.Node()
	parent := cursor.Parent()
	if selector, ok := parent.Node().(*ast.SelectorExpr); ok && selector.X == node {
		node, parent = selector, parent.Parent()
	}
	switch each := parent.Node().(type) {
	case *ast.AssignStmt:
		for _, left := range each.Lhs {
			if left == node {
				return true
			}
		}
	case *ast.BinaryExpr:
		return each.Op == token.EQL || each.Op == token.NEQ
	}
	return false
}

func hasTimeout(info *types.Info, literal *ast.CompositeLit) bool {
	for _, element := range literal.Elts {
		pair, ok := element.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		if key, isIdent := pair.Key.(*ast.Ident); isIdent && key.Name == "Timeout" {
			value := info.Types[pair.Value].Value
			return value == nil || constant.Sign(value) != 0
		}
	}
	return false
}
