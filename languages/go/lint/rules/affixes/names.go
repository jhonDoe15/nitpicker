package affixes

import (
	"go/ast"
	"go/constant"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

var (
	argumentWords = []string{"dir", "dirname", "directory", "folder", "root", "base", "route", "pkg", "cwd", "home",
		"homedir", "tmpdir"}
	hostWords     = []string{"domain", "host", "hostname", "origin", "netloc"}
	locationWords = slices.Concat([]string{"path", "pathname", "url", "href", "uri", "specifier", "importer",
		"filename"}, argumentWords, hostWords)
)

func nameOf(expr ast.Expr) string {
	switch typed := expr.(type) {
	case *ast.Ident:
		return typed.Name
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.CallExpr:
		return nameOf(typed.Fun)
	case *ast.IndexExpr:
		return nameOf(typed.X)
	case *ast.ParenExpr:
		return nameOf(typed.X)
	case *ast.StarExpr:
		return nameOf(typed.X)
	}
	return ""
}

func nameHas(expr ast.Expr, words []string) bool {
	parts := support.WordsOf(nameOf(expr))
	if len(parts) == 0 {
		return false
	}
	last := parts[len(parts)-1]
	return slices.Contains(words, last) || (last == "name" && len(parts) > 1 && parts[len(parts)-2] == "package")
}

func isDirectoryName(expr ast.Expr) bool { return nameHas(expr, argumentWords) }
func isHostName(expr ast.Expr) bool      { return nameHas(expr, hostWords) }
func isLocationName(expr ast.Expr) bool  { return nameHas(expr, locationWords) }

func constString(info *types.Info, expr ast.Expr) (string, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func text(expr ast.Expr) string {
	return strings.Join(strings.Fields(types.ExprString(expr)), " ")
}
