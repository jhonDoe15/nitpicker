package remote

import (
	"go/ast"
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
	"blocks the call for good: use `&http.Client{Timeout: 10 * time.Second}`, or send " +
	"`http.NewRequestWithContext` with a context from `context.WithTimeout`"

var defaultClientFunctions = []string{"Get", "Post", "Head", "PostForm"}

func runTimeout(pass *analysis.Pass) (any, error) {
	nodes := []ast.Node{(*ast.CallExpr)(nil), (*ast.SelectorExpr)(nil), (*ast.CompositeLit)(nil)}
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
		for _, name := range defaultClientFunctions {
			if support.IsFunc(pass.TypesInfo, node, "net/http", name) {
				return true
			}
		}
	case *ast.SelectorExpr:
		variable, ok := pass.TypesInfo.Uses[node.Sel].(*types.Var)
		return ok && variable.Pkg() != nil && variable.Pkg().Path() == "net/http" && variable.Name() == "DefaultClient"
	case *ast.CompositeLit:
		return support.IsNamed(pass.TypesInfo.TypeOf(node), "net/http", "Client") &&
			!hasField(node, "Timeout") && !timeoutSetLater(pass, cursor)
	}
	return false
}

func hasField(literal *ast.CompositeLit, name string) bool {
	for _, element := range literal.Elts {
		if pair, ok := element.(*ast.KeyValueExpr); ok {
			if key, isIdent := pair.Key.(*ast.Ident); isIdent && key.Name == name {
				return true
			}
		}
	}
	return false
}

func timeoutSetLater(pass *analysis.Pass, cursor inspector.Cursor) bool {
	target := assignedVariable(pass.TypesInfo, cursor)
	function, found := support.EnclosingFunc(cursor)
	if target == nil || !found {
		return false
	}
	for each := range function.Preorder((*ast.AssignStmt)(nil)) {
		for _, left := range each.Node().(*ast.AssignStmt).Lhs {
			selector, ok := left.(*ast.SelectorExpr)
			if !ok || selector.Sel.Name != "Timeout" {
				continue
			}
			if ident, isIdent := ast.Unparen(selector.X).(*ast.Ident); isIdent && pass.TypesInfo.Uses[ident] == target {
				return true
			}
		}
	}
	return false
}

func assignedVariable(info *types.Info, cursor inspector.Cursor) types.Object {
	parent := cursor.Parent()
	if unary, ok := parent.Node().(*ast.UnaryExpr); ok && unary.X == cursor.Node() {
		parent = parent.Parent()
	}
	switch node := parent.Node().(type) {
	case *ast.AssignStmt:
		if len(node.Lhs) == 1 {
			if ident, ok := node.Lhs[0].(*ast.Ident); ok {
				return info.ObjectOf(ident)
			}
		}
	case *ast.ValueSpec:
		if len(node.Names) == 1 {
			return info.ObjectOf(node.Names[0])
		}
	}
	return nil
}
