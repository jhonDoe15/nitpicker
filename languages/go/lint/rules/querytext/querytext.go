package querytext

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "malformed_query_text",
	Doc:      "reports query text that is malformed once its literal parts are joined",
	Requires: support.Requires,
	Run:      run,
}

var queryCalls = []string{"Query", "QueryContext", "QueryRow", "QueryRowContext", "Exec", "ExecContext", "Prepare",
	"PrepareContext", "Get", "Select", "MustExec", "NamedExec", "NamedQuery", "Queryx", "QueryRowx", "Raw"}

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.BinaryExpr)(nil), (*ast.BasicLit)(nil)) {
		node := cursor.Node().(ast.Expr)
		if support.InTestFile(pass, node) || insideConcatenation(cursor) {
			continue
		}
		operands := []ast.Expr{node}
		if binary, ok := node.(*ast.BinaryExpr); ok {
			if binary.Op != token.ADD {
				continue
			}
			operands = flatten(binary)
		} else if literal := node.(*ast.BasicLit); literal.Kind != token.STRING {
			continue
		}
		var text strings.Builder
		for _, operand := range operands {
			text.WriteString(textOf(pass.TypesInfo, operand))
		}
		problem := textProblem(text.String(), isComplete(cursor, text.String()))
		if problem == "" {
			problem = adjacentProblem(pass.TypesInfo, operands)
		}
		if problem != "" {
			pass.Reportf(node.Pos(), "%s", problem)
		}
	}
	return nil, nil
}

func insideConcatenation(cursor inspector.Cursor) bool {
	parent, ok := cursor.Parent().Node().(*ast.BinaryExpr)
	return ok && parent.Op == token.ADD
}

func flatten(binary *ast.BinaryExpr) []ast.Expr {
	var operands []ast.Expr
	for _, side := range []ast.Expr{binary.X, binary.Y} {
		if inner, ok := side.(*ast.BinaryExpr); ok && inner.Op == token.ADD {
			operands = append(operands, flatten(inner)...)
		} else {
			operands = append(operands, side)
		}
	}
	return operands
}

func plainText(info *types.Info, expr ast.Expr) (string, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func textOf(info *types.Info, expr ast.Expr) string {
	if plain, ok := plainText(info, expr); ok {
		return plain
	}
	return opaque
}

func adjacentProblem(info *types.Info, operands []ast.Expr) string {
	for index := 0; index+1 < len(operands); index++ {
		left, leftOK := plainText(info, operands[index])
		right, rightOK := plainText(info, operands[index+1])
		if leftOK && rightOK {
			if problem := runTogether(left, right); problem != "" {
				return problem
			}
		}
	}
	return ""
}

func isComplete(cursor inspector.Cursor, text string) bool {
	switch parent := cursor.Parent().Node().(type) {
	case *ast.CallExpr:
		return slices.Contains(queryCalls, callName(parent))
	case *ast.ReturnStmt, *ast.KeyValueExpr:
		return isFullQuery(text)
	case *ast.AssignStmt:
		name, ok := parent.Lhs[0].(*ast.Ident)
		if !ok || len(parent.Lhs) != 1 {
			return false
		}
		later, known := laterStatements(cursor.Parent())
		return known && !slices.ContainsFunc(later, func(statement ast.Stmt) bool { return extends(statement, name.Name) })
	}
	return false
}

func callName(call *ast.CallExpr) string {
	switch typed := call.Fun.(type) {
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.Ident:
		return typed.Name
	}
	return ""
}

func laterStatements(statement inspector.Cursor) ([]ast.Stmt, bool) {
	var later []ast.Stmt
	current := statement
	for {
		parent := current.Parent()
		switch typed := parent.Node().(type) {
		case *ast.BlockStmt:
			later = append(later, after(typed.List, current.Node())...)
		case *ast.CaseClause:
			later = append(later, after(typed.Body, current.Node())...)
		case *ast.ForStmt, *ast.RangeStmt:
			return nil, false
		case *ast.FuncDecl, *ast.FuncLit, *ast.File:
			return later, true
		}
		current = parent
	}
}

func after(list []ast.Stmt, node ast.Node) []ast.Stmt {
	for index, statement := range list {
		if statement == node {
			return list[index+1:]
		}
	}
	return nil
}

func extends(statement ast.Stmt, name string) bool {
	found := false
	ast.Inspect(statement, func(node ast.Node) bool {
		assignment, ok := node.(*ast.AssignStmt)
		if ok {
			for _, left := range assignment.Lhs {
				if ident, isIdent := left.(*ast.Ident); isIdent && ident.Name == name {
					found = true
				}
			}
		}
		return !found
	})
	return found
}
