package failures

import (
	"go/ast"
	"go/types"
	"unicode"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
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
		if !support.IsBuiltin(pass.TypesInfo, call, "panic") || support.InTestFile(pass, call) ||
			inDefaultClause(cursor) {
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

func inDefaultClause(cursor inspector.Cursor) bool {
	parent := cursor.Parent()
	if _, statement := parent.Node().(*ast.ExprStmt); !statement {
		return false
	}
	clause, ok := parent.Parent().Node().(*ast.CaseClause)
	return ok && clause.List == nil
}

func entryPoint(pass *analysis.Pass, decl *ast.FuncDecl) bool {
	name := decl.Name.Name
	if decl.Recv == nil && (name == "init" || name == "main" && pass.Pkg.Name() == "main") {
		return true
	}
	return mustName(name)
}

func mustName(name string) bool {
	for _, prefix := range []string{"Must", "must"} {
		if len(name) < len(prefix) || name[:len(prefix)] != prefix {
			continue
		}
		next, _ := utf8.DecodeRuneInString(name[len(prefix):])
		return len(name) == len(prefix) || unicode.IsUpper(next)
	}
	return false
}

func repanics(info *types.Info, decl *ast.FuncDecl, call *ast.CallExpr) bool {
	values := recovered(info, decl)
	found := false
	for _, argument := range call.Args {
		ast.Inspect(argument, func(node ast.Node) bool {
			if ident, ok := node.(*ast.Ident); ok && values[info.Uses[ident]] {
				found = true
			}
			return !found
		})
	}
	return found
}

func recovered(info *types.Info, decl *ast.FuncDecl) map[types.Object]bool {
	values := map[types.Object]bool{}
	mark := func(names []ast.Expr, results []ast.Expr) {
		if len(names) != len(results) {
			return
		}
		for index, value := range results {
			call, isCall := ast.Unparen(value).(*ast.CallExpr)
			ident, isIdent := names[index].(*ast.Ident)
			if isCall && isIdent && support.IsBuiltin(info, call, "recover") {
				values[info.ObjectOf(ident)] = true
			}
		}
	}
	ast.Inspect(decl, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.AssignStmt:
			mark(statement.Lhs, statement.Rhs)
		case *ast.ValueSpec:
			names := make([]ast.Expr, len(statement.Names))
			for index, name := range statement.Names {
				names[index] = name
			}
			mark(names, statement.Values)
		}
		return true
	})
	return values
}
