package jobs

import (
	"go/ast"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

type registration struct {
	path   string
	method string
	arg    int
}

var registrations = []registration{
	{"github.com/robfig/cron", "AddFunc", 1},
	{"github.com/go-co-op/gocron", "NewTask", 0},
	{"github.com/go-co-op/gocron", "Do", 0},
	{"github.com/RichardKnop/machinery", "RegisterTask", 1},
	{"github.com/RichardKnop/machinery", "RegisterTasks", 0},
}

const queuePackage = "github.com/hibiken/asynq"

func jobFunctions(pass *analysis.Pass) []ast.Node {
	declared := declarations(pass)
	seen := map[ast.Node]bool{}
	var found []ast.Node
	add := func(function ast.Node) {
		if function != nil && !seen[function] {
			seen[function] = true
			found = append(found, function)
		}
	}
	nodes := []ast.Node{(*ast.CallExpr)(nil), (*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)}
	for cursor := range support.Root(pass).Preorder(nodes...) {
		switch node := cursor.Node().(type) {
		case *ast.CallExpr:
			for _, function := range registered(pass.TypesInfo, node) {
				add(resolve(pass.TypesInfo, declared, function))
			}
		case *ast.FuncDecl:
			if takesTask(pass.TypesInfo, node.Type) {
				add(node)
			}
		case *ast.FuncLit:
			if takesTask(pass.TypesInfo, node.Type) {
				add(node)
			}
		}
	}
	return found
}

func declarations(pass *analysis.Pass) map[types.Object]*ast.FuncDecl {
	declared := map[types.Object]*ast.FuncDecl{}
	for _, file := range pass.Files {
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok {
				declared[pass.TypesInfo.Defs[function.Name]] = function
			}
		}
	}
	return declared
}

func registered(info *types.Info, call *ast.CallExpr) []ast.Expr {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return nil
	}
	for _, each := range registrations {
		if callee.Name() != each.method || !strings.HasPrefix(callee.Pkg().Path()+"/", each.path+"/") ||
			len(call.Args) <= each.arg {
			continue
		}
		if table, isTable := call.Args[each.arg].(*ast.CompositeLit); isTable {
			return tableValues(table)
		}
		return call.Args[each.arg : each.arg+1]
	}
	return nil
}

func tableValues(table *ast.CompositeLit) []ast.Expr {
	var values []ast.Expr
	for _, element := range table.Elts {
		if pair, ok := element.(*ast.KeyValueExpr); ok {
			values = append(values, pair.Value)
		}
	}
	return values
}

func resolve(info *types.Info, declared map[types.Object]*ast.FuncDecl, function ast.Expr) ast.Node {
	switch node := ast.Unparen(function).(type) {
	case *ast.FuncLit:
		return node
	case *ast.Ident:
		return declared[info.Uses[node]]
	case *ast.SelectorExpr:
		return declared[info.Uses[node.Sel]]
	}
	return nil
}

func takesTask(info *types.Info, signature *ast.FuncType) bool {
	for _, parameter := range signature.Params.List {
		if support.IsNamed(info.TypeOf(parameter.Type), queuePackage, "Task") {
			return true
		}
	}
	return false
}
