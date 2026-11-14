package calls

import (
	"fmt"
	"go/ast"
)

type context struct {
	branch      []string
	cleanup     bool
	conditional bool
	nested      bool
}

func (state context) arm(conditional int, arm string) context {
	branch := append(append([]string(nil), state.branch...), fmt.Sprintf("%d:%s", conditional, arm))
	state.branch = branch
	state.conditional = true
	return state
}

type visitor struct {
	collector *collector
	state     context
}

func (v visitor) walk(state context, nodes ...ast.Node) {
	for _, node := range nodes {
		if node != nil {
			ast.Walk(visitor{collector: v.collector, state: state}, node)
		}
	}
}

func (v visitor) Visit(node ast.Node) ast.Visitor {
	switch typed := node.(type) {
	case *ast.CallExpr:
		v.collector.record(typed, v.state)
	case *ast.IfStmt:
		v.conditional(typed)
		return nil
	case *ast.SwitchStmt:
		v.switched(typed.Init, typed.Tag, typed.Body)
		return nil
	case *ast.TypeSwitchStmt:
		v.switched(typed.Init, typed.Assign, typed.Body)
		return nil
	case *ast.SelectStmt:
		v.switched(nil, nil, typed.Body)
		return nil
	case *ast.ForStmt:
		inner := v.state
		inner.conditional = true
		v.walk(v.state, typed.Init, typed.Cond, typed.Post)
		v.walk(inner, typed.Body)
		return nil
	case *ast.RangeStmt:
		inner := v.state
		inner.conditional = true
		v.walk(v.state, typed.Key, typed.Value, typed.X)
		v.walk(inner, typed.Body)
		return nil
	case *ast.DeferStmt:
		return v.deferred(typed)
	case *ast.FuncLit:
		inner := v.state
		inner.nested, inner.cleanup = true, false
		v.walk(inner, typed.Body)
		return nil
	}
	return v
}

func (v visitor) conditional(statement *ast.IfStmt) {
	ordinal := v.collector.conditionals
	v.collector.conditionals++
	v.walk(v.state, statement.Init, statement.Cond)
	v.walk(v.state.arm(ordinal, "then"), statement.Body)
	if statement.Else != nil {
		v.walk(v.state.arm(ordinal, "else"), statement.Else)
	}
}

func (v visitor) switched(initial ast.Node, tag ast.Node, body *ast.BlockStmt) {
	ordinal := v.collector.conditionals
	v.collector.conditionals++
	v.walk(v.state, initial, tag)
	for position, clause := range body.List {
		arm := v.state.arm(ordinal, fmt.Sprint(position))
		switch typed := clause.(type) {
		case *ast.CaseClause:
			v.walk(v.state, exprNodes(typed.List)...)
			v.walk(arm, stmtNodes(typed.Body)...)
		case *ast.CommClause:
			v.walk(arm, typed.Comm)
			v.walk(arm, stmtNodes(typed.Body)...)
		}
	}
}

func (v visitor) deferred(statement *ast.DeferStmt) ast.Visitor {
	cleanup := v.state
	cleanup.cleanup = true
	if literal, ok := statement.Call.Fun.(*ast.FuncLit); ok {
		v.walk(cleanup, literal.Body)
		v.walk(v.state, exprNodes(statement.Call.Args)...)
		return nil
	}
	v.collector.record(statement.Call, cleanup)
	v.walk(v.state, statement.Call.Fun)
	v.walk(v.state, exprNodes(statement.Call.Args)...)
	return nil
}

func exprNodes(expressions []ast.Expr) []ast.Node {
	nodes := make([]ast.Node, len(expressions))
	for position, expression := range expressions {
		nodes[position] = expression
	}
	return nodes
}

func stmtNodes(statements []ast.Stmt) []ast.Node {
	nodes := make([]ast.Node, len(statements))
	for position, statement := range statements {
		nodes[position] = statement
	}
	return nodes
}
