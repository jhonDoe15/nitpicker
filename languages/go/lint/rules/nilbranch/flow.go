package nilbranch

import (
	"go/ast"
	"go/token"

	"golang.org/x/tools/go/analysis"
)

var fatal = map[string]bool{
	"os.Exit":        true,
	"log.Fatal":      true,
	"log.Fatalf":     true,
	"log.Fatalln":    true,
	"log.Panic":      true,
	"log.Panicf":     true,
	"log.Panicln":    true,
	"runtime.Goexit": true,
}

func leaves(pass *analysis.Pass, body *ast.BlockStmt, subject ast.Expr) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch node := node.(type) {
		case *ast.FuncLit:
			return false
		case *ast.ReturnStmt:
			found = true
		case *ast.BranchStmt:
			found = found || node.Tok != token.FALLTHROUGH
		case *ast.CallExpr:
			found = found || exits(node)
		case *ast.AssignStmt:
			found = found || assigns(pass, node.Lhs, subject)
		}
		return !found
	})
	return found
}

func exits(call *ast.CallExpr) bool {
	switch callee := call.Fun.(type) {
	case *ast.Ident:
		return callee.Name == "panic"
	case *ast.SelectorExpr:
		pkg, ok := callee.X.(*ast.Ident)
		return ok && fatal[pkg.Name+"."+callee.Sel.Name]
	}
	return false
}

func assigns(pass *analysis.Pass, targets []ast.Expr, subject ast.Expr) bool {
	for _, target := range targets {
		if same(pass, target, subject) {
			return true
		}
	}
	return false
}

func acts(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch node.(type) {
		case *ast.CallExpr, *ast.AssignStmt, *ast.IncDecStmt, *ast.SendStmt:
			found = true
		}
		return !found
	})
	return found
}
