package database

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var splitAnalyzer = &analysis.Analyzer{
	Name:     "writes_without_transaction",
	Doc:      "reports two database writes on different tables in one function with no transaction",
	Requires: support.Requires,
	Run:      runSplit,
}

const splitMessage = "this write to `%s` follows a write to `%s` in the same function with no transaction, so a " +
	"failure between them leaves half-written state: open one with `db.BeginTx` (gorm `db.Transaction`), run " +
	"both writes through it, or pass the caller's transaction in. An exception fits only when the writes are " +
	"independent (an audit row, best-effort cleanup)"

type site struct {
	write  write
	cursor inspector.Cursor
}

func runSplit(pass *analysis.Pass) (any, error) {
	var order []inspector.Cursor
	groups := map[ast.Node][]site{}
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		found, ok := writeOf(pass.TypesInfo, cursor.Node().(*ast.CallExpr))
		if !ok || found.tx || found.table == "" || support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if found.gorm && !fieldRooted(pass.TypesInfo, found.root) {
			continue
		}
		function, inside := support.EnclosingFunc(cursor)
		if !inside {
			continue
		}
		if groups[function.Node()] == nil {
			order = append(order, function)
		}
		groups[function.Node()] = append(groups[function.Node()], site{found, cursor})
	}
	for _, function := range order {
		if !transactional(pass.TypesInfo, function) {
			reportSplit(pass, groups[function.Node()])
		}
	}
	return nil, nil
}

func reportSplit(pass *analysis.Pass, sites []site) {
	for index, later := range sites {
		for _, earlier := range sites[:index] {
			if earlier.write.table != later.write.table && !exclusive(earlier.cursor, later.cursor) {
				pass.Reportf(later.write.call.Pos(), splitMessage, later.write.table, earlier.write.table)
				return
			}
		}
	}
}

func transactional(info *types.Info, function inspector.Cursor) bool {
	for each := range function.Enclosing((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if declaresTx(info, each.Node()) || opens(info, each.Node()) {
			return true
		}
	}
	return false
}

func opens(info *types.Info, function ast.Node) bool {
	found := false
	ast.Inspect(function, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok && opensTransaction(info, call) {
			found = true
		}
		return !found
	})
	return found
}

func declaresTx(info *types.Info, function ast.Node) bool {
	found := false
	ast.Inspect(function, func(node ast.Node) bool {
		if ident, ok := node.(*ast.Ident); ok {
			if object := info.Defs[ident]; object != nil && isTx(object.Type()) {
				found = true
			}
		}
		return !found
	})
	return found
}
