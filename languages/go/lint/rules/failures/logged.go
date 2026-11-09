package failures

import (
	"go/ast"
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
		if variable, isVar := info.Uses[ident].(*types.Var); isVar && types.Implements(variable.Type(), errorType) {
			values[variable] = true
		}
		return true
	})
	return values
}

func returnsLater(info *types.Info, statements []ast.Stmt, value types.Object) bool {
	for _, statement := range statements {
		result, ok := statement.(*ast.ReturnStmt)
		if !ok {
			continue
		}
		for _, expression := range result.Results {
			if errorsIn(info, expression)[value] {
				return true
			}
		}
	}
	return false
}
