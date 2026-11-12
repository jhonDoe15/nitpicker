package main

import (
	"bytes"
	"go/ast"
	"go/printer"
	"go/token"
	"reflect"
	"strings"
)

type bodyWalker struct {
	statements int
	deepest    int
	complexity int
	literals   []*ast.FuncLit
	decisions  []ast.Stmt
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
	switch statement.(type) {
	case *ast.ForStmt, *ast.RangeStmt, *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.SelectStmt:
		walker.decisions = append(walker.decisions, statement)
	}
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
	walker.decisions = append(walker.decisions, statement)
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

func position(fileSet *token.FileSet, pos token.Pos) Position {
	resolved := fileSet.Position(pos)
	return Position{Line: resolved.Line, Column: resolved.Column}
}

func arm(fileSet *token.FileSet, label string, from, to token.Pos) Arm {
	return Arm{Label: label, From: position(fileSet, from), To: position(fileSet, to)}
}

func firstStatement(statements []ast.Stmt, open token.Pos) token.Pos {
	if len(statements) == 0 {
		return open + 1
	}
	return statements[0].Pos()
}

func bodyArm(fileSet *token.FileSet, label string, body *ast.BlockStmt) Arm {
	return arm(fileSet, label, body.Lbrace, firstStatement(body.List, body.Lbrace))
}

func elseEnd(statement ast.Stmt) token.Pos {
	if block, ok := statement.(*ast.BlockStmt); ok {
		return firstStatement(block.List, block.Lbrace)
	}
	return statement.Pos()
}

func decisionBranch(fileSet *token.FileSet, statement ast.Stmt) Branch {
	branch := Branch{At: position(fileSet, statement.Pos())}
	switch typed := statement.(type) {
	case *ast.IfStmt:
		branch.Kind = "if"
		branch.Arms = []Arm{bodyArm(fileSet, "the if body", typed.Body)}
		if typed.Else == nil {
			branch.Implicit = "the condition false (the if body skipped)"
		} else {
			branch.Arms = append(branch.Arms, arm(fileSet, "the else branch", typed.Body.End(), elseEnd(typed.Else)))
		}
	case *ast.ForStmt:
		branch.Kind = "for"
		branch.Arms = []Arm{bodyArm(fileSet, "the loop body", typed.Body)}
	case *ast.RangeStmt:
		branch.Kind = "range"
		branch.Arms = []Arm{bodyArm(fileSet, "the loop body", typed.Body)}
	case *ast.SwitchStmt:
		branch.Kind = "switch"
		branch.Arms, branch.Implicit = clauseArms(fileSet, typed.Body)
	case *ast.TypeSwitchStmt:
		branch.Kind = "type switch"
		branch.Arms, branch.Implicit = clauseArms(fileSet, typed.Body)
	case *ast.SelectStmt:
		branch.Kind = "select"
		branch.Arms, _ = clauseArms(fileSet, typed.Body)
	}
	return branch
}

func clauseArms(fileSet *token.FileSet, body *ast.BlockStmt) ([]Arm, string) {
	arms := []Arm{}
	implicit := "no case matching"
	for _, clause := range body.List {
		label, colon, statements := clauseParts(fileSet, clause)
		if label == "default" {
			implicit = ""
		}
		clauseArm := arm(fileSet, label, colon+1, firstStatement(statements, colon))
		clauseArm.Fallthrough = fallthroughAt(fileSet, statements)
		arms = append(arms, clauseArm)
	}
	return arms, implicit
}

func clauseParts(fileSet *token.FileSet, clause ast.Stmt) (string, token.Pos, []ast.Stmt) {
	switch typed := clause.(type) {
	case *ast.CaseClause:
		if typed.List == nil {
			return "default", typed.Colon, typed.Body
		}
		texts := make([]string, len(typed.List))
		for index, expression := range typed.List {
			texts[index] = source(fileSet, expression)
		}
		return "case " + strings.Join(texts, ", "), typed.Colon, typed.Body
	case *ast.CommClause:
		if typed.Comm == nil {
			return "default", typed.Colon, typed.Body
		}
		return "case " + source(fileSet, typed.Comm), typed.Colon, typed.Body
	}
	return "", clause.Pos(), nil
}

func fallthroughAt(fileSet *token.FileSet, statements []ast.Stmt) *Position {
	if len(statements) == 0 {
		return nil
	}
	last, ok := statements[len(statements)-1].(*ast.BranchStmt)
	if !ok || last.Tok != token.FALLTHROUGH {
		return nil
	}
	at := position(fileSet, last.Pos())
	return &at
}

func source(fileSet *token.FileSet, node ast.Node) string {
	var text bytes.Buffer
	if err := printer.Fprint(&text, fileSet, node); err != nil {
		return "?"
	}
	return strings.Join(strings.Fields(text.String()), " ")
}
