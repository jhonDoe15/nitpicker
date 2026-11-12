package remote

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var loopAnalyzer = &analysis.Analyzer{
	Name:     "io_in_loop",
	Doc:      "reports a database or HTTP call once per item of a loop",
	Requires: support.Requires,
	Run:      runLoop,
}

const loopMessage = "one database or HTTP call per item of the loop: read or write the items in one batch " +
	"(`WHERE id = ANY($1)`, `IN (...)`, `COPY`, `pgx.Batch`, a bulk endpoint), or run the calls concurrently " +
	"under a limit with an errgroup and `SetLimit`"

func runLoop(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) || !remoteCall(pass.TypesInfo, call) {
			continue
		}
		if perItem(pass, cursor) && !exitsAfter(cursor) {
			pass.Reportf(call.Pos(), "%s", loopMessage)
		}
	}
	return nil, nil
}

func perItem(pass *analysis.Pass, cursor inspector.Cursor) bool {
	nodes := []ast.Node{(*ast.RangeStmt)(nil), (*ast.ForStmt)(nil), (*ast.FuncLit)(nil), (*ast.FuncDecl)(nil)}
	for each := range cursor.Enclosing(nodes...) {
		switch node := each.Node().(type) {
		case *ast.RangeStmt:
			if within(node.Body, cursor.Node()) && overItems(pass, node.X) {
				return true
			}
		case *ast.ForStmt:
			if within(node.Body, cursor.Node()) && countsItems(pass.TypesInfo, node.Cond) {
				return true
			}
		case *ast.FuncLit:
			if concurrent(pass.TypesInfo, each) {
				return false
			}
		case *ast.FuncDecl:
			return false
		}
	}
	return false
}

func within(body *ast.BlockStmt, node ast.Node) bool {
	return body.Pos() <= node.Pos() && node.End() <= body.End()
}

func concurrent(info *types.Info, literal inspector.Cursor) bool {
	call, ok := literal.Parent().Node().(*ast.CallExpr)
	if !ok {
		return false
	}
	if _, started := literal.Parent().Parent().Node().(*ast.GoStmt); started && call.Fun == literal.Node() {
		return true
	}
	selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	return isSelector && selector.Sel.Name == "Go" && info.Selections[selector] != nil
}

func overItems(pass *analysis.Pass, collection ast.Expr) bool {
	if _, literal := ast.Unparen(collection).(*ast.CompositeLit); literal || packageLevel(pass, collection) {
		return false
	}
	if call, ok := ast.Unparen(collection).(*ast.CallExpr); ok && support.IsBuiltin(pass.TypesInfo, call, "len") {
		return true
	}
	switch types.Unalias(pass.TypesInfo.TypeOf(collection)).Underlying().(type) {
	case *types.Slice, *types.Map:
		return true
	}
	return false
}

func packageLevel(pass *analysis.Pass, expression ast.Expr) bool {
	for {
		switch node := ast.Unparen(expression).(type) {
		case *ast.SliceExpr:
			expression = node.X
		case *ast.IndexExpr:
			expression = node.X
		case *ast.Ident:
			variable, isVar := pass.TypesInfo.Uses[node].(*types.Var)
			return isVar && variable.Parent() == pass.Pkg.Scope()
		default:
			return false
		}
	}
}

func countsItems(info *types.Info, condition ast.Expr) bool {
	binary, ok := condition.(*ast.BinaryExpr)
	if !ok {
		return false
	}
	call, isCall := ast.Unparen(binary.Y).(*ast.CallExpr)
	return isCall && support.IsBuiltin(info, call, "len")
}
