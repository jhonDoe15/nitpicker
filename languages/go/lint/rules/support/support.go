package support

import (
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

var Requires = []*analysis.Analyzer{inspect.Analyzer}

func Root(pass *analysis.Pass) inspector.Cursor {
	return pass.ResultOf[inspect.Analyzer].(*inspector.Inspector).Root()
}

func InTestFile(pass *analysis.Pass, node ast.Node) bool {
	return strings.HasSuffix(pass.Fset.Position(node.Pos()).Filename, "_test.go")
}

func IsFunc(info *types.Info, call *ast.CallExpr, path, name string) bool {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil || callee.Name() != name {
		return false
	}
	signature, _ := callee.Type().(*types.Signature)
	return callee.Pkg().Path() == path && signature != nil && signature.Recv() == nil
}

func IsBuiltin(info *types.Info, call *ast.CallExpr, name string) bool {
	ident, ok := ast.Unparen(call.Fun).(*ast.Ident)
	if !ok {
		return false
	}
	builtin, ok := info.Uses[ident].(*types.Builtin)
	return ok && builtin.Name() == name
}

func EnclosingDecl(cursor inspector.Cursor) (*ast.FuncDecl, bool) {
	for each := range cursor.Enclosing((*ast.FuncDecl)(nil)) {
		return each.Node().(*ast.FuncDecl), true
	}
	return nil, false
}

func EnclosingFunc(cursor inspector.Cursor) (inspector.Cursor, bool) {
	for each := range cursor.Enclosing((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		return each, true
	}
	return inspector.Cursor{}, false
}

func IsNamed(typ types.Type, path, name string) bool {
	named, ok := types.Unalias(Deref(typ)).(*types.Named)
	if !ok {
		return false
	}
	object := named.Obj()
	return object.Pkg() != nil && object.Pkg().Path() == path && object.Name() == name
}

func Deref(typ types.Type) types.Type {
	if pointer, ok := types.Unalias(typ).(*types.Pointer); ok {
		return pointer.Elem()
	}
	return typ
}
