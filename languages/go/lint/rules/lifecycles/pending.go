package lifecycles

import (
	"go/ast"
	"go/types"
	"regexp"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var pendingAnalyzer = &analysis.Analyzer{
	Name:     "pending_not_closed",
	Doc:      "reports a map of reply channels that the Close method never closes",
	Requires: support.Requires,
	Run:      runPending,
}

const pendingMessage = "%s holds a reply channel per pending request, but %s never closes them, " +
	"so every caller waiting on one blocks forever: range over the map in %s, `close` or send an error to each " +
	"channel, and clear the map. An exception fits only when the channels are closed elsewhere before the owner closes"

var pendingName = regexp.MustCompile(`(?i)pending|inflight|in_flight|waiter|waiting|repl(y|ies)|requests|calls`)

func runPending(pass *analysis.Pass) (any, error) {
	closers := closeMethods(pass)
	decls := funcDecls(pass)
	for cursor := range support.Root(pass).Preorder((*ast.TypeSpec)(nil)) {
		spec := cursor.Node().(*ast.TypeSpec)
		structure, ok := spec.Type.(*ast.StructType)
		if !ok || support.InTestFile(pass, spec) {
			continue
		}
		methods := closers[pass.TypesInfo.Defs[spec.Name]]
		if len(methods) == 0 {
			continue
		}
		reached := reachable(pass, decls, methods)
		for _, field := range structure.Fields.List {
			if !isChannelMap(pass, field.Type) {
				continue
			}
			for _, name := range field.Names {
				if pendingName.MatchString(name.Name) && !settles(pass, reached, pass.TypesInfo.Defs[name]) {
					closer := methods[0].Name.Name
					pass.Reportf(name.Pos(), pendingMessage, spec.Name.Name+"."+name.Name, closer+"()", closer)
				}
			}
		}
	}
	return nil, nil
}

func closeMethods(pass *analysis.Pass) map[types.Object][]*ast.FuncDecl {
	found := map[types.Object][]*ast.FuncDecl{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Recv == nil || declaration.Body == nil || !isCloseName(declaration.Name.Name) {
			continue
		}
		receiver := support.Deref(pass.TypesInfo.TypeOf(declaration.Recv.List[0].Type))
		if named, ok := receiver.(*types.Named); ok {
			found[named.Obj()] = append(found[named.Obj()], declaration)
		}
	}
	return found
}

func isChannelMap(pass *analysis.Pass, expression ast.Expr) bool {
	mapped, ok := pass.TypesInfo.TypeOf(expression).Underlying().(*types.Map)
	if !ok {
		return false
	}
	_, channel := mapped.Elem().Underlying().(*types.Chan)
	return channel
}

func funcDecls(pass *analysis.Pass) map[types.Object]*ast.FuncDecl {
	found := map[types.Object]*ast.FuncDecl{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Body != nil {
			found[pass.TypesInfo.Defs[declaration.Name]] = declaration
		}
	}
	return found
}

func reachable(pass *analysis.Pass, decls map[types.Object]*ast.FuncDecl, start []*ast.FuncDecl) []*ast.FuncDecl {
	seen := map[*ast.FuncDecl]bool{}
	queue := append([]*ast.FuncDecl{}, start...)
	var found []*ast.FuncDecl
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if seen[current] {
			continue
		}
		seen[current] = true
		found = append(found, current)
		ast.Inspect(current.Body, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok {
				if callee := decls[calleeOf(pass, call)]; callee != nil && callee.Recv != nil {
					queue = append(queue, callee)
				}
			}
			return true
		})
	}
	return found
}

func settles(pass *analysis.Pass, methods []*ast.FuncDecl, field types.Object) bool {
	for _, method := range methods {
		targets := withAliases(pass, method.Body, field)
		found := false
		ast.Inspect(method.Body, func(node ast.Node) bool {
			switch value := node.(type) {
			case *ast.RangeStmt:
				found = found || (mentions(pass, value.X, targets) && completes(pass, value.Body))
			case *ast.CallExpr:
				found = found || handedOver(pass, value, targets)
			}
			return !found
		})
		if found {
			return true
		}
	}
	return false
}

func withAliases(pass *analysis.Pass, body *ast.BlockStmt, field types.Object) map[types.Object]bool {
	targets := map[types.Object]bool{field: true}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for index, right := range assign.Rhs {
			if mentions(pass, right, targets) {
				if object := objectOf(pass, assign.Lhs[index]); object != nil {
					targets[object] = true
				}
			}
		}
		return true
	})
	return targets
}

func completes(pass *analysis.Pass, body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.SendStmt:
			found = true
		case *ast.CallExpr:
			found = found || support.IsBuiltin(pass.TypesInfo, value, "close")
		}
		return !found
	})
	return found
}

func handedOver(pass *analysis.Pass, call *ast.CallExpr, targets map[types.Object]bool) bool {
	for _, name := range []string{"clear", "delete", "len", "cap"} {
		if support.IsBuiltin(pass.TypesInfo, call, name) {
			return false
		}
	}
	for _, argument := range call.Args {
		if mentions(pass, argument, targets) {
			return true
		}
	}
	return false
}

func mentions(pass *analysis.Pass, expression ast.Expr, targets map[types.Object]bool) bool {
	found := false
	ast.Inspect(expression, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.SelectorExpr:
			found = found || targets[pass.TypesInfo.Uses[value.Sel]]
		case *ast.Ident:
			found = found || targets[pass.TypesInfo.Uses[value]]
		}
		return !found
	})
	return found
}

func objectOf(pass *analysis.Pass, expression ast.Expr) types.Object {
	switch value := ast.Unparen(expression).(type) {
	case *ast.Ident:
		if object := pass.TypesInfo.Defs[value]; object != nil {
			return object
		}
		return pass.TypesInfo.Uses[value]
	case *ast.SelectorExpr:
		return pass.TypesInfo.Uses[value.Sel]
	}
	return nil
}

func calleeOf(pass *analysis.Pass, call *ast.CallExpr) types.Object {
	switch value := ast.Unparen(call.Fun).(type) {
	case *ast.Ident:
		return pass.TypesInfo.Uses[value]
	case *ast.SelectorExpr:
		return pass.TypesInfo.Uses[value.Sel]
	}
	return nil
}
