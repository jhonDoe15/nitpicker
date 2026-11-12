package concurrency

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var goroutineAnalyzer = &analysis.Analyzer{
	Name:     "unowned_goroutine",
	Doc:      "reports a goroutine that nothing waits for or stops",
	Requires: support.Requires,
	Run:      runGoroutine,
}

const goroutineMessage = "nothing waits for or stops this goroutine: start it with `wg.Go` or an errgroup's `Go`, " +
	"or pass it a context the caller cancels or a channel the caller reads"

func runGoroutine(pass *analysis.Pass) (any, error) {
	declarations := functionBodies(pass)
	for cursor := range support.Root(pass).Preorder((*ast.GoStmt)(nil)) {
		statement := cursor.Node().(*ast.GoStmt)
		if owned(pass.TypesInfo, statement.Call, declarations) {
			continue
		}
		pass.Reportf(statement.Pos(), "%s", goroutineMessage)
	}
	return nil, nil
}

func functionBodies(pass *analysis.Pass) map[types.Object]*ast.BlockStmt {
	bodies := map[types.Object]*ast.BlockStmt{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		decl := cursor.Node().(*ast.FuncDecl)
		if decl.Body != nil {
			bodies[pass.TypesInfo.Defs[decl.Name]] = decl.Body
		}
	}
	return bodies
}

func owned(info *types.Info, call *ast.CallExpr, bodies map[types.Object]*ast.BlockStmt) bool {
	if mentionsOwner(info, call) {
		return true
	}
	if selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr); ok && holdsOwner(info.TypeOf(selector.X)) {
		return true
	}
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok {
		return false
	}
	body := bodies[callee.Origin()]
	return body != nil && mentionsOwner(info, body)
}

func mentionsOwner(info *types.Info, node ast.Node) bool {
	found := false
	ast.Inspect(node, func(each ast.Node) bool {
		if expression, ok := each.(ast.Expr); ok && owner(info.TypeOf(expression)) {
			found = true
		}
		return !found
	})
	return found
}

func holdsOwner(typ types.Type) bool {
	if typ == nil {
		return false
	}
	structure, ok := support.Deref(typ).Underlying().(*types.Struct)
	if !ok {
		return false
	}
	for field := range structure.Fields() {
		if owner(field.Type()) {
			return true
		}
	}
	return false
}

func owner(typ types.Type) bool {
	if typ == nil {
		return false
	}
	if _, ok := types.Unalias(typ).Underlying().(*types.Chan); ok {
		return true
	}
	return support.IsNamed(typ, "context", "Context") || support.IsNamed(typ, "sync", "WaitGroup") ||
		support.IsNamed(typ, "golang.org/x/sync/errgroup", "Group")
}
