package catalog

import (
	"go/ast"
	"regexp"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/packages"
)

var (
	ignoreDirective     = regexp.MustCompile(`^//\s?nolint:`)
	exhaustiveDirective = "//exhaustive:"
	checkContexts       = contexts.Run
)

// Prepare readies the catalog linters for the loaded packages. It limits contextcheck to the
// modules of the loaded packages, as golangci-lint does, so that what it infers about the
// standard library and dependencies does not reach the module's calls, and it turns off the
// `//nolint:` doc comments contextcheck reads and the `//exhaustive:` directives.
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
		for _, group := range file.Comments {
			for _, comment := range group.List {
				comment.Text = neutralized(comment.Text)
			}
		}
	}
}

func neutralized(text string) string {
	switch {
	case ignoreDirective.MatchString(text):
		return strings.Replace(text, "nolint:", "nolinx:", 1)
	case strings.HasPrefix(text, exhaustiveDirective):
		return "//exhaustivx:" + text[len(exhaustiveDirective):]
	default:
		return text
	}
}
