package lifecycles

import (
	"go/ast"
	"go/token"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var cleanupAnalyzer = &analysis.Analyzer{
	Name:     "cleanup_skipped",
	Doc:      "reports a cleanup function that returns on the first failed release and skips the rest",
	Requires: support.Requires,
	Run:      runCleanup,
}

const cleanupMessage = "%s returns when its release fails, so %s never run and a resource stays open: " +
	"run every release and join the errors with `errors.Join`, or `defer` one close per resource. " +
	"An exception fits only when a failed release should abort the remaining ones"

func runCleanup(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Body == nil || !isCloseName(declaration.Name.Name) || support.InTestFile(pass, declaration) {
			continue
		}
		ast.Inspect(declaration.Body, func(node ast.Node) bool {
			if block, ok := node.(*ast.BlockStmt); ok {
				checkBlock(pass, declaration.Name.Name, block.List)
			}
			_, nested := node.(*ast.FuncLit)
			return !nested
		})
	}
	return nil, nil
}

func checkBlock(pass *analysis.Pass, function string, list []ast.Stmt) {
	for index, statement := range list {
		release, next := earlyReturn(pass, list, index)
		if release == nil {
			continue
		}
		skipped := laterSteps(pass, list[next:])
		if len(skipped) > 0 {
			pass.Reportf(statement.Pos(), cleanupMessage, function+" at "+releaseName(release), strings.Join(skipped, ", "))
			return
		}
	}
}

func releaseName(call *ast.CallExpr) string {
	return expressionText(call.Fun) + "()"
}

func expressionText(expression ast.Expr) string {
	switch value := ast.Unparen(expression).(type) {
	case *ast.SelectorExpr:
		return expressionText(value.X) + "." + value.Sel.Name
	case *ast.Ident:
		return value.Name
	}
	return "release"
}

func earlyReturn(pass *analysis.Pass, list []ast.Stmt, index int) (*ast.CallExpr, int) {
	switch statement := list[index].(type) {
	case *ast.IfStmt:
		if call := initRelease(pass, statement.Init); call != nil && failsWithReturn(statement) {
			return call, index + 1
		}
	case *ast.AssignStmt:
		call := assignedRelease(pass, statement)
		if call != nil && index+1 < len(list) {
			if next, ok := list[index+1].(*ast.IfStmt); ok && next.Init == nil && failsWithReturn(next) {
				return call, index + 2
			}
		}
	}
	return nil, 0
}

func initRelease(pass *analysis.Pass, statement ast.Stmt) *ast.CallExpr {
	assignment, ok := statement.(*ast.AssignStmt)
	if !ok {
		return nil
	}
	return assignedRelease(pass, assignment)
}

func assignedRelease(pass *analysis.Pass, assignment *ast.AssignStmt) *ast.CallExpr {
	if len(assignment.Rhs) != 1 {
		return nil
	}
	call := releaseCall(pass.TypesInfo, assignment.Rhs[0])
	if call == nil || !returnsError(pass.TypesInfo, call) {
		return nil
	}
	return call
}

func failsWithReturn(statement *ast.IfStmt) bool {
	condition, ok := statement.Cond.(*ast.BinaryExpr)
	if !ok || condition.Op != token.NEQ || statement.Else != nil || len(statement.Body.List) == 0 {
		return false
	}
	_, returns := statement.Body.List[len(statement.Body.List)-1].(*ast.ReturnStmt)
	return returns
}

func laterSteps(pass *analysis.Pass, list []ast.Stmt) []string {
	var steps []string
	for _, statement := range list {
		if name := stepName(pass, statement); name != "" {
			steps = append(steps, name)
		}
	}
	return steps
}

func stepName(pass *analysis.Pass, statement ast.Stmt) string {
	switch value := statement.(type) {
	case *ast.ExprStmt:
		if call := releaseCall(pass.TypesInfo, value.X); call != nil {
			return releaseName(call)
		}
	case *ast.ReturnStmt:
		for _, result := range value.Results {
			if call := releaseCall(pass.TypesInfo, result); call != nil {
				return releaseName(call)
			}
		}
	case *ast.AssignStmt:
		if call := assignedRelease(pass, value); call != nil {
			return releaseName(call)
		}
		return resetName(value)
	case *ast.IfStmt:
		if call := initRelease(pass, value.Init); call != nil {
			return releaseName(call)
		}
	}
	return ""
}

func resetName(assignment *ast.AssignStmt) string {
	if len(assignment.Lhs) != 1 || len(assignment.Rhs) != 1 || assignment.Tok != token.ASSIGN {
		return ""
	}
	if ident, ok := assignment.Rhs[0].(*ast.Ident); ok && ident.Name == "nil" {
		return expressionText(assignment.Lhs[0])
	}
	return ""
}
