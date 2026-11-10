package catalog

import (
	"go/ast"
	"regexp"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/packages"
)

var (
	ignoreDirective = regexp.MustCompile(`^//\s?nolint:`)
	checkContexts   = contexts.Run
)

// Prepare readies the catalog linters for the loaded packages. It limits contextcheck to the
// modules of the loaded packages, as golangci-lint does, so that what it infers about the
// standard library and dependencies does not reach the module's calls, and it turns off the
// `//nolint:` doc comments contextcheck reads.
func Prepare(loaded []*packages.Package) {
	modules := map[string]bool{}
	for _, pkg := range loaded {
		if pkg.Module != nil {
			modules[pkg.Module.Path] = true
		}
	}
	packages.Visit(loaded, nil, func(pkg *packages.Package) {
		ignoreSuppressions(pkg.Syntax)
	})
	contexts.Run = func(pass *analysis.Pass) (any, error) {
		if !inModules(pass.Pkg.Path(), modules) {
			return nil, nil
		}
		return checkContexts(pass)
	}
}

func inModules(path string, modules map[string]bool) bool {
	for module := range modules {
		if path == module || strings.HasPrefix(path, module+"/") {
			return true
		}
	}
	return false
}

func ignoreSuppressions(files []*ast.File) {
	for _, file := range files {
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Doc == nil {
				continue
			}
			for _, comment := range function.Doc.List {
				if ignoreDirective.MatchString(comment.Text) {
					comment.Text = strings.Replace(comment.Text, "nolint:", "nolinted:", 1)
				}
			}
		}
	}
}
