package concurrency

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var sleepAnalyzer = &analysis.Analyzer{
	Name:     "sleep_to_wait",
	Doc:      "reports time.Sleep after the function started a goroutine",
	Requires: support.Requires,
	Run:      runSleep,
}

const sleepMessage = "sleeping after starting a goroutine guesses how long it takes: " +
	"wait for it with `sync.WaitGroup.Wait`, an errgroup, a channel or a context"

func runSleep(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if !support.IsFunc(pass.TypesInfo, call, "time", "Sleep") || support.InTestFile(pass, call) {
			continue
		}
		function, found := support.EnclosingFunc(cursor)
		if found && startsBefore(pass, function, call) {
			pass.Reportf(call.Pos(), "%s", sleepMessage)
		}
	}
	return nil, nil
}

func startsBefore(pass *analysis.Pass, function inspector.Cursor, call *ast.CallExpr) bool {
	for each := range function.Preorder((*ast.GoStmt)(nil), (*ast.CallExpr)(nil)) {
		if each.Node().Pos() >= call.Pos() {
			break
		}
		if !starts(pass, each.Node()) {
			continue
		}
		if inner, ok := support.EnclosingFunc(each); ok && inner == function && reaches(each, call) {
			return true
		}
	}
	return false
}

func reaches(start inspector.Cursor, call *ast.CallExpr) bool {
	for each := range start.Enclosing() {
		statement, isStatement := each.Node().(ast.Stmt)
		if !isStatement {
			continue
		}
		switch each.Parent().Node().(type) {
		case *ast.BlockStmt, *ast.CaseClause, *ast.CommClause:
			parent := each.Parent().Node()
			if statement.End() <= call.Pos() && parent.Pos() <= call.Pos() && call.End() <= parent.End() {
				return true
			}
		case *ast.FuncDecl, *ast.FuncLit:
			return false
		}
	}
	return false
}

func starts(pass *analysis.Pass, node ast.Node) bool {
	if _, ok := node.(*ast.GoStmt); ok {
		return true
	}
	call := node.(*ast.CallExpr)
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Go" {
		return false
	}
	selection := pass.TypesInfo.Selections[selector]
	if selection == nil {
		return false
	}
	method, _ := selection.Obj().(*types.Func)
	return method != nil && owner(method.Signature().Recv().Type())
}
