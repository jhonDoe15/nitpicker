package replacements

import (
	"go/ast"
	"go/constant"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var Analyzer = &analysis.Analyzer{
	Name:     "expanding_replacement",
	Doc:      "reports a regexp replacement that is not constant, because $1 and ${name} in it are expanded",
	Requires: support.Requires,
	Run:      run,
}

const message = "`%s` expands `$1`, `${name}` and `$$` in a replacement that is not a constant, so a `$` in the " +
	"value is lost or replaced: use `%s`, or escape the dollars (`strings.ReplaceAll(value, \"$\", \"$$\")`). " +
	"A constant replacement that uses `$1` on purpose is fine."

var literal = map[string]string{
	"ReplaceAllString": "ReplaceAllLiteralString",
	"ReplaceAll":       "ReplaceAllLiteral",
}

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) {
			continue
		}
		method, ok := regexpMethod(pass, call)
		if ok && len(call.Args) == 2 && !isSafe(pass, call.Args[1]) {
			pass.Reportf(call.Args[1].Pos(), message, method, literal[method])
		}
	}
	return nil, nil
}

func regexpMethod(pass *analysis.Pass, call *ast.CallExpr) (string, bool) {
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok || callee.Pkg() == nil || callee.Pkg().Path() != "regexp" {
		return "", false
	}
	_, known := literal[callee.Name()]
	signature, _ := callee.Type().(*types.Signature)
	return callee.Name(), known && signature != nil && signature.Recv() != nil
}

func isSafe(pass *analysis.Pass, replacement ast.Expr) bool {
	if value := pass.TypesInfo.Types[replacement].Value; value != nil && value.Kind() == constant.String {
		return true
	}
	switch typed := ast.Unparen(replacement).(type) {
	case *ast.CallExpr:
		return escapesDollar(pass, typed)
	case *ast.CompositeLit:
		return allConstant(pass, typed.Elts)
	case *ast.Ident:
		return constantVariable(pass, typed)
	}
	return false
}

func constantVariable(pass *analysis.Pass, ident *ast.Ident) bool {
	variable, ok := pass.TypesInfo.Uses[ident].(*types.Var)
	if !ok || variable.Parent() != pass.Pkg.Scope() {
		return false
	}
	for _, file := range pass.Files {
		for _, declaration := range file.Decls {
			if initializedConstant(pass, declaration, variable) {
				return true
			}
		}
	}
	return false
}

func initializedConstant(pass *analysis.Pass, declaration ast.Decl, variable *types.Var) bool {
	general, ok := declaration.(*ast.GenDecl)
	if !ok {
		return false
	}
	for _, spec := range general.Specs {
		values, isValue := spec.(*ast.ValueSpec)
		for index := 0; isValue && index < len(values.Names) && index < len(values.Values); index++ {
			value := pass.TypesInfo.Types[values.Values[index]].Value
			if values.Names[index].Pos() == variable.Pos() && value != nil && value.Kind() == constant.String {
				return true
			}
		}
	}
	return false
}

func escapesDollar(pass *analysis.Pass, call *ast.CallExpr) bool {
	if conversion := pass.TypesInfo.Types[call.Fun]; conversion.IsType() && len(call.Args) == 1 {
		return isSafe(pass, call.Args[0])
	}
	isReplace := support.IsFunc(pass.TypesInfo, call, "strings", "ReplaceAll") ||
		support.IsFunc(pass.TypesInfo, call, "strings", "Replace") ||
		support.IsFunc(pass.TypesInfo, call, "bytes", "ReplaceAll")
	if !isReplace || len(call.Args) < 3 {
		return false
	}
	old := pass.TypesInfo.Types[call.Args[1]].Value
	return old != nil && old.Kind() == constant.String && constant.StringVal(old) == "$"
}

func allConstant(pass *analysis.Pass, elements []ast.Expr) bool {
	for _, element := range elements {
		if pass.TypesInfo.Types[element].Value == nil {
			return false
		}
	}
	return true
}
