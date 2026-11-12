package design

import (
	"go/ast"
	"go/token"
	"go/types"
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var stateAnalyzer = &analysis.Analyzer{
	Name:     "mutable_package_state",
	Doc:      "reports a package-level variable that a function changes",
	Requires: support.Requires,
	Run:      runState,
}

const stateMessage = "package variable `%s` is changed after initialization, so every caller shares it: " +
	"keep the state in a value the caller creates and passes in (`sync.OnceValue` for a lazy value)"

func runState(pass *analysis.Pass) (any, error) {
	variables := packageVariables(pass)
	changed := map[*types.Var]bool{}
	root := support.Root(pass)
	nodes := []ast.Node{
		(*ast.AssignStmt)(nil), (*ast.IncDecStmt)(nil), (*ast.UnaryExpr)(nil), (*ast.CallExpr)(nil), (*ast.RangeStmt)(nil),
	}
	for cursor := range root.Preorder(nodes...) {
		if !changesAfterInit(pass, cursor) {
			continue
		}
		for _, target := range targets(pass.TypesInfo, cursor) {
			if variable, ok := pass.TypesInfo.Uses[rootIdent(target)].(*types.Var); ok && variables[variable] != nil {
				changed[variable] = true
			}
		}
	}
	for variable := range changed {
		pass.Reportf(variables[variable].Pos(), stateMessage, variable.Name())
	}
	return nil, nil
}

func changesAfterInit(pass *analysis.Pass, cursor inspector.Cursor) bool {
	if _, inFunction := support.EnclosingFunc(cursor); !inFunction || support.InTestFile(pass, cursor.Node()) {
		return false
	}
	decl, found := support.EnclosingDecl(cursor)
	return !found || decl.Recv != nil || decl.Name.Name != "init"
}

func packageVariables(pass *analysis.Pass) map[*types.Var]*ast.Ident {
	variables := map[*types.Var]*ast.Ident{}
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		for _, decl := range file.Decls {
			general, ok := decl.(*ast.GenDecl)
			if !ok || general.Tok != token.VAR {
				continue
			}
			for _, spec := range general.Specs {
				for _, name := range spec.(*ast.ValueSpec).Names {
					variable, isVar := pass.TypesInfo.Defs[name].(*types.Var)
					if isVar && name.Name != "_" {
						variables[variable] = name
					}
				}
			}
		}
	}
	return variables
}

func targets(info *types.Info, cursor inspector.Cursor) []ast.Expr {
	switch node := cursor.Node().(type) {
	case *ast.AssignStmt:
		if node.Tok == token.DEFINE {
			return nil
		}
		return node.Lhs
	case *ast.IncDecStmt:
		return []ast.Expr{node.X}
	case *ast.UnaryExpr:
		if node.Op == token.AND {
			return []ast.Expr{node.X}
		}
	case *ast.CallExpr:
		return callTargets(info, node)
	case *ast.RangeStmt:
		if node.Tok == token.ASSIGN {
			return slices.DeleteFunc([]ast.Expr{node.Key, node.Value}, func(each ast.Expr) bool { return each == nil })
		}
	}
	return nil
}

func callTargets(info *types.Info, call *ast.CallExpr) []ast.Expr {
	if support.IsBuiltin(info, call, "delete") || support.IsBuiltin(info, call, "clear") ||
		support.IsBuiltin(info, call, "copy") {
		return call.Args[:1]
	}
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok {
		return nil
	}
	selection := info.Selections[selector]
	if selection == nil || selection.Kind() != types.MethodVal {
		return nil
	}
	receiver := info.TypeOf(selector.X)
	_, pointerValue := types.Unalias(receiver).(*types.Pointer)
	if !pointerValue && (support.IsNamed(receiver, "sync", "Once") || support.IsNamed(receiver, "sync", "WaitGroup")) {
		return []ast.Expr{selector.X}
	}
	return nil
}

func rootIdent(expression ast.Expr) *ast.Ident {
	for {
		switch node := ast.Unparen(expression).(type) {
		case *ast.Ident:
			return node
		case *ast.IndexExpr:
			expression = node.X
		case *ast.SelectorExpr:
			expression = node.X
		case *ast.StarExpr:
			expression = node.X
		default:
			return nil
		}
	}
}
