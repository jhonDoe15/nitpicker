package index

import (
	"go/ast"
	"go/token"
)

func (pkg *Package) collectCases() {
	for _, file := range pkg.Files {
		for _, declaration := range file.Syntax.Decls {
			general, ok := declaration.(*ast.GenDecl)
			if ok && general.Tok == token.CONST {
				pkg.groupCases(general)
			}
		}
	}
}

func (pkg *Package) groupCases(declaration *ast.GenDecl) {
	var current ast.Expr
	for _, spec := range declaration.Specs {
		value, ok := spec.(*ast.ValueSpec)
		if !ok {
			continue
		}
		switch {
		case value.Type != nil:
			current = value.Type
		case len(value.Values) > 0:
			current = pkg.conversionType(value.Values[0])
		}
		identifier, ok := current.(*ast.Ident)
		if !ok {
			continue
		}
		owner := pkg.Types[identifier.Name]
		for _, name := range value.Names {
			if owner != nil && name.Name != "_" {
				owner.Cases = append(owner.Cases, name.Name)
			}
		}
	}
}

func (pkg *Package) conversionType(expression ast.Expr) ast.Expr {
	call, ok := expression.(*ast.CallExpr)
	if !ok || len(call.Args) != 1 {
		return nil
	}
	if identifier, ok := call.Fun.(*ast.Ident); ok && pkg.Types[identifier.Name] != nil {
		return identifier
	}
	return nil
}
