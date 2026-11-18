package translation

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

func stringOf(pass *analysis.Pass, expr ast.Expr) (string, bool) {
	value := pass.TypesInfo.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func replacerPairs(pass *analysis.Pass, call *ast.CallExpr) ([]string, bool) {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Replace" || len(call.Args) != 1 {
		return nil, false
	}
	constructor, ok := ast.Unparen(selector.X).(*ast.CallExpr)
	if !ok || !support.IsFunc(pass.TypesInfo, constructor, "strings", "NewReplacer") || constructor.Ellipsis.IsValid() {
		return nil, false
	}
	var replacements []string
	for index := 1; index < len(constructor.Args); index += 2 {
		text, constantText := stringOf(pass, constructor.Args[index])
		if !constantText {
			text = "\x00"
		}
		replacements = append(replacements, text)
	}
	return replacements, len(replacements) > 0
}

func linkOf(pass *analysis.Pass, call *ast.CallExpr) ([]string, ast.Expr, bool) {
	if replacements, ok := replacerPairs(pass, call); ok {
		return replacements, call.Args[0], true
	}
	isReplace := support.IsFunc(pass.TypesInfo, call, "strings", "ReplaceAll") ||
		support.IsFunc(pass.TypesInfo, call, "strings", "Replace")
	if !isReplace || len(call.Args) < 3 {
		return nil, nil, false
	}
	text, _ := stringOf(pass, call.Args[2])
	return []string{text}, call.Args[0], true
}

func chainOf(pass *analysis.Pass, top *ast.CallExpr) ([]string, ast.Expr) {
	var replacements []string
	var current ast.Expr = top
	for {
		call, ok := ast.Unparen(current).(*ast.CallExpr)
		if !ok {
			return replacements, current
		}
		links, receiver, isLink := linkOf(pass, call)
		if !isLink {
			return replacements, current
		}
		replacements = append(replacements, links...)
		current = receiver
	}
}

func isReceiver(pass *analysis.Pass, parents map[ast.Node]ast.Node, call *ast.CallExpr) bool {
	var node ast.Node = call
	for {
		parent, ok := parents[node].(*ast.ParenExpr)
		if !ok {
			break
		}
		node = parent
	}
	outer, ok := parents[node].(*ast.CallExpr)
	if !ok {
		return false
	}
	_, receiver, isLink := linkOf(pass, outer)
	return isLink && receiver == node
}

func isRegexpCompile(pass *analysis.Pass, call *ast.CallExpr) bool {
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok || callee.Pkg() == nil || callee.Pkg().Path() != "regexp" {
		return false
	}
	switch callee.Name() {
	case "Compile", "MustCompile", "MatchString", "Match", "CompilePOSIX", "MustCompilePOSIX":
		return len(call.Args) > 0
	}
	return false
}

func reachesRegexp(pass *analysis.Pass, parents map[ast.Node]ast.Node, node ast.Node) bool {
	for current := node; ; {
		parent := parents[current]
		switch typed := parent.(type) {
		case *ast.ParenExpr:
		case *ast.BinaryExpr:
			if typed.Op != token.ADD {
				return false
			}
		case *ast.CallExpr:
			if isRegexpCompile(pass, typed) {
				return typed.Args[0] == current
			}
			if !support.IsFunc(pass.TypesInfo, typed, "fmt", "Sprintf") {
				return false
			}
		default:
			return false
		}
		current = parent
	}
}

func flowsToRegexp(pass *analysis.Pass, parents map[ast.Node]ast.Node, call *ast.CallExpr) bool {
	if reachesRegexp(pass, parents, call) {
		return true
	}
	assign, ok := parents[call].(*ast.AssignStmt)
	if !ok || len(assign.Lhs) != 1 || len(assign.Rhs) != 1 {
		return false
	}
	target, ok := assign.Lhs[0].(*ast.Ident)
	if !ok {
		return false
	}
	object := pass.TypesInfo.ObjectOf(target)
	for use, used := range pass.TypesInfo.Uses {
		if used == object && use != target && reachesRegexp(pass, parents, use) {
			return true
		}
	}
	return false
}
