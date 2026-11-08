package main

import (
	"go/ast"
	"go/token"
	"reflect"
)

type bodyWalker struct {
	statements int
	deepest    int
	complexity int
	literals   []*ast.FuncLit
}

func newBodyWalker() *bodyWalker {
	return &bodyWalker{complexity: 1}
}

func (walker *bodyWalker) block(statements []ast.Stmt, depth int) {
	for _, statement := range statements {
		walker.statement(statement, depth)
	}
}

func (walker *bodyWalker) control(depth int) int {
	walker.deepest = max(walker.deepest, depth+1)
	walker.complexity++
	return depth + 1
}

func (walker *bodyWalker) statement(statement ast.Stmt, depth int) {
	switch typed := statement.(type) {
	case nil:
		return
	case *ast.BlockStmt:
		walker.block(typed.List, depth)
		return
	case *ast.LabeledStmt:
		walker.statement(typed.Stmt, depth)
		return
	case *ast.EmptyStmt:
		return
	}
	walker.statements++
	walker.compound(statement, depth)
}

func (walker *bodyWalker) compound(statement ast.Stmt, depth int) {
	switch typed := statement.(type) {
	case *ast.IfStmt:
		walker.ifChain(typed, depth)
	case *ast.ForStmt:
		inner := walker.control(depth)
		walker.expressions(typed.Init)
		walker.expressions(typed.Cond)
		walker.expressions(typed.Post)
		walker.block(typed.Body.List, inner)
	case *ast.RangeStmt:
		inner := walker.control(depth)
		walker.expressions(typed.X)
		walker.block(typed.Body.List, inner)
	case *ast.SwitchStmt:
		walker.switchClauses(typed.Init, typed.Body, depth, typed.Tag)
	case *ast.TypeSwitchStmt:
		walker.switchClauses(typed.Init, typed.Body, depth, typed.Assign)
	case *ast.SelectStmt:
		walker.switchClauses(nil, typed.Body, depth, nil)
	default:
		walker.expressions(statement)
	}
}

func (walker *bodyWalker) ifChain(statement *ast.IfStmt, depth int) {
	inner := walker.control(depth)
	walker.expressions(statement.Init)
	walker.expressions(statement.Cond)
	walker.block(statement.Body.List, inner)
	switch typed := statement.Else.(type) {
	case *ast.IfStmt:
		walker.statements++
		walker.ifChain(typed, depth)
	case *ast.BlockStmt:
		walker.block(typed.List, inner)
	}
}

func (walker *bodyWalker) switchClauses(init ast.Stmt, body *ast.BlockStmt, depth int, subject ast.Node) {
	walker.deepest = max(walker.deepest, depth+1)
	walker.expressions(init)
	walker.expressions(subject)
	for _, clause := range body.List {
		switch typed := clause.(type) {
		case *ast.CaseClause:
			if typed.List != nil {
				walker.complexity++
			}
			for _, expression := range typed.List {
				walker.expressions(expression)
			}
			walker.block(typed.Body, depth+1)
		case *ast.CommClause:
			if typed.Comm != nil {
				walker.complexity++
				walker.expressions(typed.Comm)
			}
			walker.block(typed.Body, depth+1)
		}
	}
}

func (walker *bodyWalker) expressions(node ast.Node) {
	if node == nil || reflect.ValueOf(node).IsNil() {
		return
	}
	ast.Inspect(node, func(child ast.Node) bool {
		switch typed := child.(type) {
		case *ast.FuncLit:
			walker.literals = append(walker.literals, typed)
			return false
		case *ast.BinaryExpr:
			if typed.Op == token.LAND || typed.Op == token.LOR {
				walker.complexity++
			}
		}
		return true
	})
}
