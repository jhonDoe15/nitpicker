package failures

import (
	"go/ast"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var panicAnalyzer = &analysis.Analyzer{
	Name:     "panic_for_failure",
	Doc:      "reports panic outside main, init and Must functions",
	Requires: support.Requires,
	Run:      runPanic,
}

const panicMessage = "panic outside main, init and a Must function: return an error and let the caller decide " +
	"(a Must function, such as `regexp.MustCompile`, panics only on input the program itself wrote)"

func runPanic(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if !support.IsBuiltin(pass.TypesInfo, call, "panic") || support.InTestFile(pass, call) {
			continue
		}
		decl, found := support.EnclosingDecl(cursor)
		if found && (entryPoint(pass, decl) || repanics(pass.TypesInfo, decl, call)) {
			continue
		}
		pass.Reportf(call.Pos(), "%s", panicMessage)
	}
	return nil, nil
}

func entryPoint(pass *analysis.Pass, decl *ast.FuncDecl) bool {
	name := decl.Name.Name
	if decl.Recv == nil && (name == "init" || name == "main" && pass.Pkg.Name() == "main") {
		return true
	}
	return strings.HasPrefix(name, "Must") || strings.HasPrefix(name, "must")
}

func repanics(info *types.Info, decl *ast.FuncDecl, call *ast.CallExpr) bool {
	if len(call.Args) != 1 {
		return false
	}
	ident, ok := ast.Unparen(call.Args[0]).(*ast.Ident)
	if !ok || info.Uses[ident] == nil {
		return false
	}
	return recovered(info, decl)[info.Uses[ident]]
}

func recovered(info *types.Info, decl *ast.FuncDecl) map[types.Object]bool {
	values := map[types.Object]bool{}
	ast.Inspect(decl, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for index, value := range assign.Rhs {
			call, isCall := ast.Unparen(value).(*ast.CallExpr)
			ident, isIdent := assign.Lhs[index].(*ast.Ident)
			if isCall && isIdent && support.IsBuiltin(info, call, "recover") {
				values[info.ObjectOf(ident)] = true
			}
		}
		return true
	})
	return values
}
