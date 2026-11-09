package failures

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var loggedAnalyzer = &analysis.Analyzer{
	Name:     "logged_and_returned",
	Doc:      "reports an error that is logged and then returned",
	Requires: support.Requires,
	Run:      runLogged,
}

const loggedMessage = "the error is logged and then returned, so it is reported twice: return it wrapped with `%w` " +
	"and let the caller that handles it log it, or log it here and handle it"

var errorType = types.Universe.Lookup("error").Type().Underlying().(*types.Interface)

func runLogged(pass *analysis.Pass) (any, error) {
	nodes := []ast.Node{(*ast.BlockStmt)(nil), (*ast.CaseClause)(nil), (*ast.CommClause)(nil)}
	for cursor := range support.Root(pass).Preorder(nodes...) {
		statements := statementsOf(cursor.Node())
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		for index, statement := range statements {
			if !logs(pass.TypesInfo, statement) {
				continue
			}
			for value := range errorsIn(pass.TypesInfo, statement) {
				if returnsLater(pass.TypesInfo, statements[index+1:], value) {
					pass.Reportf(statement.Pos(), "%s", loggedMessage)
					break
				}
			}
		}
	}
	return nil, nil
}

func statementsOf(node ast.Node) []ast.Stmt {
	switch block := node.(type) {
	case *ast.BlockStmt:
		return block.List
	case *ast.CaseClause:
		return block.Body
	case *ast.CommClause:
		return block.Body
	}
	return nil
}

func errorsIn(info *types.Info, node ast.Node) map[types.Object]bool {
	values := map[types.Object]bool{}
	ast.Inspect(node, func(each ast.Node) bool {
		ident, ok := each.(*ast.Ident)
		if !ok {
			return true
		}
		if variable, isVar := info.Uses[ident].(*types.Var); isVar && local(variable) &&
			types.Implements(variable.Type(), errorType) {
			values[variable] = true
		}
		return true
	})
	return values
}

func local(variable *types.Var) bool {
	return !variable.IsField() && variable.Pkg() != nil && variable.Parent() != variable.Pkg().Scope()
}

func returnsLater(info *types.Info, statements []ast.Stmt, value types.Object) bool {
	for _, statement := range statements {
		if result, ok := statement.(*ast.ReturnStmt); ok {
			return returns(info, result, value)
		}
		if assigns(info, statement, value) || branches(statement) {
			return false
		}
	}
	return false
}

func returns(info *types.Info, result *ast.ReturnStmt, value types.Object) bool {
	for _, expression := range result.Results {
		if errorsIn(info, expression)[value] {
			return true
		}
	}
	return false
}

func assigns(info *types.Info, statement ast.Stmt, value types.Object) bool {
	found := false
	ast.Inspect(statement, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.AssignStmt:
			for _, target := range each.Lhs {
				if ident, ok := target.(*ast.Ident); ok && info.ObjectOf(ident) == value {
					found = true
				}
			}
		case *ast.UnaryExpr:
			if ident, ok := each.X.(*ast.Ident); ok && each.Op == token.AND && info.Uses[ident] == value {
				found = true
			}
		}
		return !found
	})
	return found
}

func branches(statement ast.Stmt) bool {
	found := false
	ast.Inspect(statement, func(node ast.Node) bool {
		switch node.(type) {
		case *ast.FuncLit:
			return false
		case *ast.ReturnStmt, *ast.BranchStmt:
			found = true
		}
		return !found
	})
	return found
}
