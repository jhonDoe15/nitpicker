package remote

import (
	"go/ast"
	"go/token"

	"golang.org/x/tools/go/ast/inspector"
)

func insideLiteral(cursor inspector.Cursor) bool {
	for each := range cursor.Enclosing((*ast.RangeStmt)(nil), (*ast.ForStmt)(nil), (*ast.FuncLit)(nil)) {
		_, literal := each.Node().(*ast.FuncLit)
		return literal
	}
	return false
}

func exitsAfter(cursor inspector.Cursor) bool {
	if insideLiteral(cursor) {
		return false
	}
	for each := range cursor.Enclosing() {
		switch node := each.Node().(type) {
		case *ast.RangeStmt, *ast.ForStmt, *ast.FuncLit, *ast.FuncDecl:
			return false
		case *ast.IfStmt:
			if !within(node.Body, cursor.Node()) && exitsOnSuccess(node) {
				return true
			}
		}
		statement, isStatement := each.Node().(ast.Stmt)
		if isStatement && endsLoop(following(each, statement)) {
			return true
		}
	}
	return false
}

func following(cursor inspector.Cursor, statement ast.Stmt) []ast.Stmt {
	var list []ast.Stmt
	switch parent := cursor.Parent().Node().(type) {
	case *ast.BlockStmt:
		list = parent.List
	case *ast.CaseClause:
		list = parent.Body
	case *ast.CommClause:
		list = parent.Body
	}
	for index, each := range list {
		if each == statement {
			return list[index+1:]
		}
	}
	return nil
}

func exitsOnSuccess(statement *ast.IfStmt) bool {
	body := statement.Body.List
	return succeeded(statement.Cond) && len(body) > 0 && exits(body[len(body)-1])
}

func endsLoop(statements []ast.Stmt) bool {
	if len(statements) == 0 {
		return false
	}
	if next, ok := statements[0].(*ast.IfStmt); ok {
		return exitsOnSuccess(next)
	}
	return exits(statements[0])
}

func exits(statement ast.Stmt) bool {
	switch last := statement.(type) {
	case *ast.ReturnStmt:
		return true
	case *ast.BranchStmt:
		return last.Tok == token.BREAK && last.Label == nil
	}
	return false
}

func succeeded(condition ast.Expr) bool {
	binary, ok := condition.(*ast.BinaryExpr)
	if !ok || binary.Op != token.EQL {
		return false
	}
	right, isIdent := binary.Y.(*ast.Ident)
	return isIdent && right.Name == "nil"
}
