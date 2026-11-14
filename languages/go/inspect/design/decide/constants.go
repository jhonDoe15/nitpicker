package decide

import (
	"go/ast"
	"go/token"
	"strconv"
)

func (f *finder) constants(kind subject, expressions []ast.Expr) ([]string, bool) {
	group := make([]string, 0, len(expressions))
	for _, expression := range expressions {
		text, ok := f.constant(kind, expression)
		if !ok {
			return nil, false
		}
		group = append(group, text)
	}
	return group, true
}

func (f *finder) constant(kind subject, expression ast.Expr) (string, bool) {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return f.constant(kind, typed.X)
	case *ast.Ident:
		variable := f.env.PackageVar(typed.Name)
		return f.named(kind, typed.Name, variable != nil && variable.Const)
	case *ast.SelectorExpr:
		qualifier, ok := typed.X.(*ast.Ident)
		if !ok || f.env.Declared(qualifier.Name) {
			return "", false
		}
		dir, project := f.env.File.Imports[qualifier.Name]
		if !project {
			return "", false
		}
		variable := f.env.Index.Packages[dir].Vars[typed.Sel.Name]
		return f.named(kind, typed.Sel.Name, variable != nil && variable.Const)
	case *ast.BasicLit:
		if kind.cases != nil {
			return "", false
		}
		return literalText(typed)
	}
	return "", false
}

func (f *finder) named(kind subject, name string, isConstant bool) (string, bool) {
	if kind.cases != nil {
		return name, kind.cases[name]
	}
	return name, isConstant
}

func literalText(literal *ast.BasicLit) (string, bool) {
	if literal.Kind == token.STRING {
		text, err := strconv.Unquote(literal.Value)
		return text, err == nil
	}
	return literal.Value, literal.Kind == token.INT || literal.Kind == token.CHAR
}
