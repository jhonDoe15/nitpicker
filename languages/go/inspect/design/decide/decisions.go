package decide

import (
	"go/ast"
	"go/token"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Decision struct {
	Subject   string     `json:"subject"`
	Groups    [][]string `json:"groups"`
	Line      int        `json:"line"`
	Otherwise bool       `json:"otherwise,omitempty"`
}

type finder struct {
	env       *scope.Env
	decisions []Decision
	consumed  map[*ast.IfStmt]bool
}

func Of(env *scope.Env, body *ast.BlockStmt) []Decision {
	if body == nil {
		return nil
	}
	f := &finder{env: env, consumed: map[*ast.IfStmt]bool{}}
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.SwitchStmt:
			f.switched(typed)
		case *ast.IfStmt:
			if !f.consumed[typed] {
				f.chained(typed)
			}
		}
		return true
	})
	return f.decisions
}

type subject struct {
	id    string
	cases map[string]bool
}

func (f *finder) subjectOf(expression ast.Expr) (subject, bool) {
	if parenthesized, ok := expression.(*ast.ParenExpr); ok {
		return f.subjectOf(parenthesized.X)
	}
	if enum := f.env.TypeOf(expression).Project(); enum != nil && isEnum(enum) {
		cases := map[string]bool{}
		for _, name := range enum.Cases {
			cases[name] = true
		}
		return subject{id: enum.ID(), cases: cases}, true
	}
	selector, ok := expression.(*ast.SelectorExpr)
	if !ok {
		return subject{}, false
	}
	owner := f.env.TypeOf(selector.X).Project()
	if owner == nil {
		return subject{}, false
	}
	if _, isStruct := owner.Spec.Type.(*ast.StructType); !isStruct {
		return subject{}, false
	}
	field, found := f.env.Index.Field(owner, selector.Sel.Name)
	if !found {
		return subject{}, false
	}
	return subject{id: field.Owner.ID() + "." + field.Name}, true
}

func isEnum(info *index.TypeInfo) bool {
	switch info.Spec.Type.(type) {
	case *ast.StructType, *ast.InterfaceType:
		return false
	}
	return len(info.Cases) > 0
}

func (f *finder) record(kind subject, groups [][]string, line int, otherwise bool) {
	if len(groups) == 0 {
		return
	}
	f.decisions = append(f.decisions, Decision{Subject: kind.id, Groups: groups, Line: line, Otherwise: otherwise})
}

func (f *finder) switched(statement *ast.SwitchStmt) {
	if statement.Tag == nil {
		f.taglessSwitch(statement)
		return
	}
	kind, ok := f.subjectOf(statement.Tag)
	if !ok {
		return
	}
	var groups [][]string
	otherwise := false
	for _, clause := range statement.Body.List {
		entry := clause.(*ast.CaseClause)
		if entry.List == nil {
			otherwise = true
			continue
		}
		group, constants := f.constants(kind, entry.List)
		if !constants {
			return
		}
		groups = append(groups, group)
	}
	f.record(kind, groups, f.env.File.Line(statement.Pos()), otherwise)
}

func (f *finder) taglessSwitch(statement *ast.SwitchStmt) {
	var kind subject
	var groups [][]string
	otherwise, found := false, false
	for _, clause := range statement.Body.List {
		entry := clause.(*ast.CaseClause)
		if entry.List == nil {
			otherwise = true
			continue
		}
		if len(entry.List) != 1 {
			return
		}
		arm, group, ok := f.tests(entry.List[0])
		if !ok || (found && arm.id != kind.id) {
			return
		}
		kind, found = arm, true
		groups = append(groups, group)
	}
	if found {
		f.record(kind, groups, f.env.File.Line(statement.Pos()), otherwise)
	}
}

func (f *finder) chained(statement *ast.IfStmt) {
	var kind subject
	var groups [][]string
	otherwise, found := false, false
	for current := statement; current != nil; {
		arm, group, ok := f.tests(current.Cond)
		if !ok || (found && arm.id != kind.id) {
			return
		}
		kind, found = arm, true
		groups = append(groups, group)
		switch next := current.Else.(type) {
		case *ast.IfStmt:
			f.consumed[next] = true
			current = next
			continue
		case nil:
		default:
			otherwise = true
		}
		break
	}
	f.record(kind, groups, f.env.File.Line(statement.Pos()), otherwise)
}

func (f *finder) tests(condition ast.Expr) (subject, []string, bool) {
	switch typed := condition.(type) {
	case *ast.ParenExpr:
		return f.tests(typed.X)
	case *ast.BinaryExpr:
		switch typed.Op {
		case token.LOR:
			left, first, ok := f.tests(typed.X)
			right, second, more := f.tests(typed.Y)
			if !ok || !more || left.id != right.id {
				return subject{}, nil, false
			}
			return left, append(first, second...), true
		case token.EQL:
			return f.equality(typed)
		}
	}
	return subject{}, nil, false
}

func (f *finder) equality(comparison *ast.BinaryExpr) (subject, []string, bool) {
	for _, pair := range [][2]ast.Expr{{comparison.X, comparison.Y}, {comparison.Y, comparison.X}} {
		kind, ok := f.subjectOf(pair[0])
		if !ok {
			continue
		}
		if group, constants := f.constants(kind, []ast.Expr{pair[1]}); constants {
			return kind, group, true
		}
	}
	return subject{}, nil, false
}
