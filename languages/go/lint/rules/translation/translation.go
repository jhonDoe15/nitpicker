package translation

import (
	"go/ast"
	"go/constant"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "pattern_translation",
	Doc:      "reports a glob, regex or LIKE pattern translated by replace calls without escaping the target",
	Requires: support.Requires,
	Run:      run,
}

const regexMessage = "this chain of replace calls turns a glob or pattern into a regular expression without " +
	"`regexp.QuoteMeta` on the value first, so a `.`, `+`, `(` or `$` in it changes what matches: quote the " +
	"value, restore the wildcards from their quoted form (`\\*` to `.*`), or tokenise the pattern and map each token"

const likeMessage = "this chain of replace calls builds a SQL LIKE pattern without escaping `%`, `_` and the " +
	"escape character first, so those characters in the value act as wildcards: escape them before mapping the " +
	"wildcards and add an ESCAPE clause, or tokenise the pattern and map each token"

var regexTokens = map[string]bool{
	".*": true, ".+": true, ".": true, ".?": true, "(.*)": true, "(.+)": true, "[^/]*": true, "[^/]+": true,
	"[^/]": true, "([^/]*)": true, "([^/]+)": true, `[\s\S]*`: true,
}

var escapingReplacement = regexp.MustCompile(`^\\+[%_]$`)
var escapeName = regexp.MustCompile(`(?i)escape|quote`)

func run(pass *analysis.Pass) (any, error) {
	parents := parentsOf(pass)
	for _, file := range pass.Files {
		if strings.HasSuffix(pass.Fset.Position(file.Pos()).Filename, "_test.go") {
			continue
		}
		ast.Inspect(file, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok {
				check(pass, parents, call)
			}
			return true
		})
	}
	return nil, nil
}

func parentsOf(pass *analysis.Pass) map[ast.Node]ast.Node {
	parents := map[ast.Node]ast.Node{}
	for _, file := range pass.Files {
		var stack []ast.Node
		ast.Inspect(file, func(node ast.Node) bool {
			if node == nil {
				stack = stack[:len(stack)-1]
				return true
			}
			if len(stack) > 0 {
				parents[node] = stack[len(stack)-1]
			}
			stack = append(stack, node)
			return true
		})
	}
	return parents
}

func check(pass *analysis.Pass, parents map[ast.Node]ast.Node, call *ast.CallExpr) {
	if _, _, ok := linkOf(pass, call); !ok || isReceiver(pass, parents, call) {
		return
	}
	replacements, root := chainOf(pass, call)
	if len(replacements) < 2 || isEscaped(replacements, root) || isConstant(pass, root) {
		return
	}
	switch kindOf(replacements) {
	case "like":
		pass.Report(analysis.Diagnostic{Pos: call.Pos(), Message: likeMessage})
	case "regex":
		if flowsToRegexp(pass, parents, call) {
			pass.Report(analysis.Diagnostic{Pos: call.Pos(), Message: regexMessage})
		}
	}
}

func kindOf(replacements []string) string {
	likes, regexes := 0, false
	hasPercent := false
	for _, replacement := range replacements {
		if replacement == "%" || replacement == "_" {
			likes++
			hasPercent = hasPercent || replacement == "%"
		}
		regexes = regexes || regexTokens[replacement]
	}
	if hasPercent && likes >= 2 {
		return "like"
	}
	if regexes {
		return "regex"
	}
	return ""
}

func isEscaped(replacements []string, root ast.Expr) bool {
	for _, replacement := range replacements {
		if escapingReplacement.MatchString(replacement) {
			return true
		}
	}
	switch typed := ast.Unparen(root).(type) {
	case *ast.CallExpr:
		return escapeName.MatchString(calleeName(typed))
	case *ast.Ident:
		return escapeName.MatchString(typed.Name)
	}
	return false
}

func calleeName(call *ast.CallExpr) string {
	switch fun := ast.Unparen(call.Fun).(type) {
	case *ast.Ident:
		return fun.Name
	case *ast.SelectorExpr:
		return fun.Sel.Name
	}
	return ""
}

func isConstant(pass *analysis.Pass, root ast.Expr) bool {
	value := pass.TypesInfo.Types[root].Value
	return value != nil && value.Kind() != constant.Unknown
}
