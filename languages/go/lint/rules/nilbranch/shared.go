package nilbranch

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var writers = map[string]bool{
	"Print": true, "Printf": true, "Println": true, "Fprint": true, "Fprintf": true, "Fprintln": true,
	"Write": true, "WriteString": true, "WriteByte": true, "WriteRune": true,
	"Debug": true, "Debugf": true, "Info": true, "Infof": true, "Warn": true, "Warnf": true,
	"Error": true, "Errorf": true, "Log": true, "Logf": true, "Add": true, "Set": true,
}

var builtinWriters = map[string]bool{"append": true, "print": true, "println": true, "len": true}

func receivers(pass *analysis.Pass) map[types.Object]bool {
	found := map[types.Object]bool{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Recv == nil {
			continue
		}
		for _, field := range declaration.Recv.List {
			for _, name := range field.Names {
				found[pass.TypesInfo.Defs[name]] = true
			}
		}
	}
	return found
}

func isShared(pass *analysis.Pass, subject ast.Expr, held map[types.Object]bool) bool {
	root := rootOf(subject)
	if root == nil {
		return false
	}
	object := pass.TypesInfo.ObjectOf(root)
	if object == nil {
		return false
	}
	if _, ok := object.(*types.Var); ok && object.Parent() == pass.Pkg.Scope() {
		return true
	}
	_, field := subject.(*ast.SelectorExpr)
	return field && held[object]
}

func isWriter(call *ast.CallExpr) bool {
	switch function := call.Fun.(type) {
	case *ast.Ident:
		return builtinWriters[function.Name]
	case *ast.SelectorExpr:
		return writers[function.Sel.Name]
	}
	return false
}

func initialises(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if _, literal := node.(*ast.FuncLit); literal {
			return false
		}
		if call, ok := node.(*ast.CallExpr); ok && !isWriter(call) {
			found = true
		}
		return !found
	})
	return found
}
