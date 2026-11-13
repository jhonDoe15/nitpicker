package reads

import (
	"go/ast"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Read struct {
	Type    string   `json:"type"`
	Fields  []string `json:"fields"`
	Decided []string `json:"decided,omitempty"`
	Line    int      `json:"line"`
}

type value struct {
	read    Read
	fields  map[string]bool
	decided map[string]bool
}

type span struct{ from, to int }

func Of(env *scope.Env, body *ast.BlockStmt) []Read {
	if body == nil {
		return nil
	}
	conditions := conditionSpans(body)
	values := map[string]*value{}
	var order []*value
	ast.Inspect(body, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		key := baseKey(env, selector.X)
		owner := env.TypeOf(selector.X).Project()
		if key == "" || owner == nil {
			return true
		}
		if _, found := env.Index.Field(owner, selector.Sel.Name); !found {
			return true
		}
		entry := values[key+"\x00"+owner.ID()]
		if entry == nil {
			entry = &value{
				read:   Read{Type: owner.ID(), Line: env.File.Line(selector.Pos())},
				fields: map[string]bool{}, decided: map[string]bool{},
			}
			values[key+"\x00"+owner.ID()] = entry
			order = append(order, entry)
		}
		entry.fields[selector.Sel.Name] = true
		if inside(conditions, int(selector.Pos())) {
			entry.decided[selector.Sel.Name] = true
		}
		return true
	})
	reads := make([]Read, 0, len(order))
	for _, entry := range order {
		entry.read.Fields = sorted(entry.fields)
		entry.read.Decided = sorted(entry.decided)
		reads = append(reads, entry.read)
	}
	return reads
}

func sorted(set map[string]bool) []string {
	names := make([]string, 0, len(set))
	for name := range set {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func inside(spans []span, position int) bool {
	for _, candidate := range spans {
		if candidate.from <= position && position < candidate.to {
			return true
		}
	}
	return false
}

func baseKey(env *scope.Env, expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return baseKey(env, typed.X)
	case *ast.StarExpr:
		return baseKey(env, typed.X)
	case *ast.Ident:
		if typed.Name != env.Receiver && env.Declared(typed.Name) {
			return typed.Name
		}
	case *ast.SelectorExpr:
		base, ok := typed.X.(*ast.Ident)
		if ok && env.Receiver != "" && base.Name == env.Receiver && env.Owner != nil {
			if _, field := env.Index.Field(env.Owner, typed.Sel.Name); field {
				return "this." + typed.Sel.Name
			}
		}
	}
	return ""
}

func conditionSpans(body *ast.BlockStmt) []span {
	var spans []span
	add := func(node ast.Node) {
		if node != nil {
			spans = append(spans, span{int(node.Pos()), int(node.End())})
		}
	}
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.IfStmt:
			add(typed.Cond)
		case *ast.ForStmt:
			if typed.Cond != nil {
				add(typed.Cond)
			}
		case *ast.SwitchStmt:
			if typed.Tag != nil {
				add(typed.Tag)
				break
			}
			for _, clause := range typed.Body.List {
				for _, expression := range clause.(*ast.CaseClause).List {
					add(expression)
				}
			}
		}
		return true
	})
	return spans
}
