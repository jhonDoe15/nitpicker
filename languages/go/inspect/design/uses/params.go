package uses

import (
	"go/ast"
	"go/token"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Forward struct {
	Target   string `json:"target"`
	Position int    `json:"position"`
}

type ParamUse struct {
	Param    int       `json:"param"`
	Fields   []string  `json:"fields"`
	Forwards []Forward `json:"forwards"`
	Opaque   bool      `json:"opaque,omitempty"`
}

type tracked struct {
	use    ParamUse
	fields map[string]bool
}

type walker struct {
	env    *scope.Env
	known  func(string) bool
	params map[*ast.Object]*tracked
	order  []*tracked
	stack  []ast.Node
}

func Params(env *scope.Env, declaration *ast.FuncDecl, accepts func(*index.TypeInfo) bool, known func(string) bool) []ParamUse {
	if declaration.Body == nil || declaration.Type.Params == nil {
		return nil
	}
	w := &walker{env: env, known: known, params: map[*ast.Object]*tracked{}}
	for _, param := range scope.ParamObjects(declaration) {
		_, variadic := param.Field.Type.(*ast.Ellipsis)
		project := index.Ty{Expr: param.Field.Type, File: env.File}.Project()
		if project != nil && !variadic && accepts(project) {
			entry := &tracked{use: ParamUse{Param: param.Position, Fields: []string{}, Forwards: []Forward{}}, fields: map[string]bool{}}
			w.params[param.Object] = entry
			w.order = append(w.order, entry)
		}
	}
	if len(w.order) == 0 {
		return nil
	}
	ast.Walk(w, declaration.Body)
	uses := make([]ParamUse, 0, len(w.order))
	for _, entry := range w.order {
		for name := range entry.fields {
			entry.use.Fields = append(entry.use.Fields, name)
		}
		sort.Strings(entry.use.Fields)
		uses = append(uses, entry.use)
	}
	return uses
}

func (w *walker) Visit(node ast.Node) ast.Visitor {
	if node == nil {
		w.stack = w.stack[:len(w.stack)-1]
		return nil
	}
	w.stack = append(w.stack, node)
	if identifier, ok := node.(*ast.Ident); ok && identifier.Obj != nil {
		if entry := w.params[identifier.Obj]; entry != nil {
			w.classify(entry)
		}
	}
	return w
}

func isWrapper(node ast.Node) bool {
	switch typed := node.(type) {
	case *ast.ParenExpr, *ast.StarExpr:
		return true
	case *ast.UnaryExpr:
		return typed.Op == token.AND
	}
	return false
}

func (w *walker) classify(entry *tracked) {
	for _, node := range w.stack {
		if _, closure := node.(*ast.FuncLit); closure {
			entry.use.Opaque = true
		}
	}
	at := len(w.stack) - 1
	for at > 0 && isWrapper(w.stack[at-1]) {
		at--
	}
	if at == 0 {
		entry.use.Opaque = true
		return
	}
	switch parent := w.stack[at-1].(type) {
	case *ast.SelectorExpr:
		if parent.X == w.stack[at] {
			entry.fields[parent.Sel.Name] = true
			return
		}
	case *ast.CallExpr:
		if w.forward(entry, parent, w.stack[at]) {
			return
		}
	case *ast.BinaryExpr:
		if comparesToNil(parent) {
			return
		}
	}
	entry.use.Opaque = true
}

func comparesToNil(comparison *ast.BinaryExpr) bool {
	if comparison.Op != token.EQL && comparison.Op != token.NEQ {
		return false
	}
	for _, side := range []ast.Expr{comparison.X, comparison.Y} {
		if identifier, ok := side.(*ast.Ident); ok && identifier.Name == "nil" {
			return true
		}
	}
	return false
}

func (w *walker) forward(entry *tracked, call *ast.CallExpr, argument ast.Node) bool {
	position := -1
	for at, candidate := range call.Args {
		if candidate == argument {
			position = at
		}
	}
	callee := w.env.Callee(call)
	target := callee.Target()
	signature := callee.Signature()
	if position < 0 || call.Ellipsis.IsValid() || target == "" || signature == nil || !w.known(target) {
		return false
	}
	count, variadic := 0, false
	for _, field := range signature.Params.List {
		count += max(1, len(field.Names))
		_, variadic = field.Type.(*ast.Ellipsis)
	}
	if position >= count || (variadic && position >= count-1) {
		return false
	}
	entry.use.Forwards = append(entry.use.Forwards, Forward{Target: target, Position: position})
	return true
}
