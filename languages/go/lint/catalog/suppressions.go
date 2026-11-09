package catalog

import (
	"go/ast"
	"regexp"
)

var ignoreDirective = regexp.MustCompile(`^//\s?nolint:`)

func ignoreSuppressions(files []*ast.File) {
	for _, file := range files {
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Doc == nil {
				continue
			}
			for _, comment := range function.Doc.List {
				if ignoreDirective.MatchString(comment.Text) {
					comment.Text = "//ignored:" + comment.Text[len(ignoreDirective.FindString(comment.Text)):]
				}
			}
		}
	}
}
