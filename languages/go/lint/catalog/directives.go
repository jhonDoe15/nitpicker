package catalog

import (
	"strings"

	"golang.org/x/tools/go/analysis"
)

const responseHandled = "bodyclose:handled"

var handledDirective = &analysis.Analyzer{
	Name: "handled",
	Doc:  "reports the //bodyclose:handled directive, which stops bodyclose checking the function's callers",
	Run:  reportHandledDirectives,
}

func reportHandledDirectives(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for _, group := range file.Comments {
			for _, comment := range group.List {
				if strings.TrimSpace(strings.TrimPrefix(comment.Text, "//")) == responseHandled {
					pass.Reportf(comment.Pos(), "//bodyclose:handled stops bodyclose checking the callers of this function")
				}
			}
		}
	}
	return nil, nil
}
