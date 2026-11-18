package database

import (
	"go/ast"
	"go/constant"
	"go/types"
	"regexp"
	"strings"

	"golang.org/x/tools/go/ast/inspector"
)

var statement = regexp.MustCompile(
	"(?i)^\\s*(?:insert\\s+(?:or\\s+\\w+\\s+)?into|replace\\s+into|update|delete\\s+from)\\s+(?:only\\s+)?[\"`]?([\\w.]+)")

func statementTable(info *types.Info, args []ast.Expr) string {
	for _, arg := range args {
		value := info.Types[arg].Value
		if value == nil || value.Kind() != constant.String {
			continue
		}
		if match := statement.FindStringSubmatch(constant.StringVal(value)); match != nil {
			name := strings.ToLower(match[1])
			return name[strings.LastIndex(name, ".")+1:]
		}
		return ""
	}
	return ""
}

func gormChain(info *types.Info, call *ast.CallExpr, receiver ast.Expr) (ast.Expr, string) {
	table := ""
	if len(call.Args) > 0 {
		table = modelTable(info, call.Args[0])
	}
	if method := ast.Unparen(call.Fun).(*ast.SelectorExpr).Sel.Name; method == "Exec" {
		table = statementTable(info, call.Args)
	}
	current := receiver
	for {
		inner, isCall := ast.Unparen(current).(*ast.CallExpr)
		if !isCall {
			return current, table
		}
		chained, ok := ast.Unparen(inner.Fun).(*ast.SelectorExpr)
		if !ok {
			return nil, table
		}
		table = chainTable(info, chained.Sel.Name, inner.Args, table)
		current = chained.X
	}
}

func chainTable(info *types.Info, method string, args []ast.Expr, current string) string {
	if len(args) == 0 {
		return current
	}
	switch method {
	case "Model":
		return modelTable(info, args[0])
	case "Table":
		if value := info.Types[args[0]].Value; value != nil && value.Kind() == constant.String {
			name := strings.ToLower(constant.StringVal(value))
			return name[strings.LastIndex(name, ".")+1:]
		}
		return ""
	}
	return current
}

func modelTable(info *types.Info, expression ast.Expr) string {
	typ := info.TypeOf(expression)
	for typ != nil {
		switch each := types.Unalias(typ).(type) {
		case *types.Pointer:
			typ = each.Elem()
		case *types.Slice:
			typ = each.Elem()
		case *types.Named:
			if _, isStruct := each.Underlying().(*types.Struct); isStruct {
				return strings.ToLower(each.Obj().Name())
			}
			return ""
		default:
			return ""
		}
	}
	return ""
}

func fieldRooted(info *types.Info, root ast.Expr) bool {
	switch node := ast.Unparen(root).(type) {
	case *ast.SelectorExpr:
		selection := info.Selections[node]
		return selection != nil && selection.Kind() == types.FieldVal
	case *ast.Ident:
		variable, isVar := info.Uses[node].(*types.Var)
		return isVar && variable.Parent() == variable.Pkg().Scope()
	}
	return false
}

func exclusive(first, second inspector.Cursor) bool {
	for each := range first.Enclosing() {
		switch node := each.Node().(type) {
		case *ast.IfStmt:
			if node.Else != nil && (holds(node.Body, first) && holds(node.Else, second) ||
				holds(node.Else, first) && holds(node.Body, second)) {
				return true
			}
		case *ast.BlockStmt:
			if !holds(node, second) && endsWithReturn(node.List) {
				return true
			}
		case *ast.CaseClause, *ast.CommClause:
			if !holds(node, second) && holds(each.Parent().Parent().Node(), second) {
				return true
			}
		case *ast.FuncDecl, *ast.FuncLit:
			return false
		}
	}
	return false
}

func holds(outer ast.Node, inner inspector.Cursor) bool {
	return outer.Pos() <= inner.Node().Pos() && inner.Node().End() <= outer.End()
}

func endsWithReturn(list []ast.Stmt) bool {
	if len(list) == 0 {
		return false
	}
	_, returns := list[len(list)-1].(*ast.ReturnStmt)
	return returns
}
