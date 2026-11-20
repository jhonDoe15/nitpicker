package textsplits

import (
	"go/ast"
	"go/constant"
	"go/types"
	"regexp"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{pairAnalyzer, keyAnalyzer, hostAnalyzer, lineAnalyzer, cutAnalyzer}
}

func constString(info *types.Info, expr ast.Expr) (string, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func isString(info *types.Info, expr ast.Expr) bool {
	basic, ok := types.Unalias(info.TypeOf(expr)).Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsString != 0
}

func nameOf(expr ast.Expr) string {
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		return typed.Name
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.CallExpr:
		return nameOf(typed.Fun)
	case *ast.IndexExpr:
		return nameOf(typed.X)
	}
	return ""
}

func isCall(info *types.Info, expr ast.Expr, path string, names ...string) (*ast.CallExpr, bool) {
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	if !ok {
		return nil, false
	}
	for _, name := range names {
		if support.IsFunc(info, call, path, name) {
			return call, true
		}
	}
	return nil, false
}

func conversionOperand(info *types.Info, expr ast.Expr) (ast.Expr, bool) {
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	if !ok || len(call.Args) != 1 || !info.Types[call.Fun].IsType() {
		return nil, false
	}
	return call.Args[0], true
}

func functionBody(cursor inspector.Cursor) ast.Node {
	if function, ok := support.EnclosingFunc(cursor); ok {
		return function.Node()
	}
	return cursor.Node()
}

func mentionsLiteral(root ast.Node, info *types.Info, test func(string) bool) bool {
	found := false
	ast.Inspect(root, func(node ast.Node) bool {
		if expr, ok := node.(ast.Expr); ok && !found {
			if text, isConst := constString(info, expr); isConst && test(text) {
				found = true
			}
		}
		return !found
	})
	return found
}

func calls(root ast.Node, info *types.Info, path string, names ...string) bool {
	found := false
	ast.Inspect(root, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok && !found {
			for _, name := range names {
				found = found || support.IsFunc(info, call, path, name)
			}
		}
		return !found
	})
	return found
}

func intConst(info *types.Info, expr ast.Expr) (int64, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.Int {
		return 0, false
	}
	return constant.Int64Val(value)
}

var clockName = regexp.MustCompile(`(?i)time|clock|duration|hhmm|ratio|aspect`)
