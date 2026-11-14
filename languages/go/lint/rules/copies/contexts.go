package copies

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

func exempt(pass *analysis.Pass, cursor inspector.Cursor) bool {
	literal := cursor.Node()
	switch parent := cursor.Parent().Node().(type) {
	case *ast.ImportSpec:
		return true
	case *ast.Field:
		return parent.Tag == literal
	case *ast.CallExpr:
		return labelOrFormat(pass.TypesInfo, parent, literal)
	case *ast.IndexExpr:
		return parent.Index == literal
	case *ast.SliceExpr:
		return parent.Low == literal || parent.High == literal || parent.Max == literal
	}
	return inConstDecl(cursor)
}

func inConstDecl(cursor inspector.Cursor) bool {
	for each := range cursor.Enclosing((*ast.GenDecl)(nil)) {
		return each.Node().(*ast.GenDecl).Tok == token.CONST
	}
	return false
}

func labelOrFormat(info *types.Info, call *ast.CallExpr, literal ast.Node) bool {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok {
		return false
	}
	signature := callee.Type().(*types.Signature)
	for index, argument := range call.Args {
		if argument != literal || index >= signature.Params().Len() {
			continue
		}
		name := signature.Params().At(index).Name()
		return name == "format" || index == 0 && callee.Name() == "Run" && signature.Recv() != nil
	}
	return false
}

func pinned(pass *analysis.Pass, cursor inspector.Cursor, matches candidates) bool {
	scope, ok := pinScope(cursor)
	if !ok {
		return false
	}
	found := false
	ast.Inspect(scope, func(node ast.Node) bool {
		if ident, ok := node.(*ast.Ident); ok {
			for _, match := range matches {
				found = found || pass.TypesInfo.Uses[ident] == match.object
			}
		}
		return !found
	})
	return found
}

func pinScope(cursor inspector.Cursor) (ast.Node, bool) {
	for each := range cursor.Enclosing() {
		switch node := each.Node().(type) {
		case *ast.CompositeLit, *ast.CallExpr:
			return node, true
		case *ast.BinaryExpr:
			if node.Op == token.EQL || node.Op == token.NEQ {
				return node, true
			}
		case ast.Stmt, ast.Decl:
			return nil, false
		}
	}
	return nil, false
}
