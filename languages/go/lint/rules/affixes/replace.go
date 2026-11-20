package affixes

import (
	"go/ast"
	"go/constant"
	"go/types"
	"regexp"
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var ReplaceAnalyzer = &analysis.Analyzer{
	Name:     "unanchored_affix_replace",
	Doc:      "reports a string replace that removes a suffix or prefix instead of an anchored check",
	Requires: support.Requires,
	Run:      runReplace,
}

const (
	suffixReplaceMessage = "A string pattern replaces the first occurrence anywhere, so `blog.git.io` loses its " +
		"`.git`: anchor it with `strings.TrimSuffix(name, \".git\")`"
	prefixReplaceMessage = "A string pattern replaces the first occurrence anywhere, not the leading part: use " +
		"`strings.TrimPrefix`, check `HasPrefix` first, or set the field on the parsed URL"
)

var (
	suffixPattern = regexp.MustCompile(`(?i)^\.[a-z0-9]{1,8}$`)
	urlParts      = []string{"port", "host", "hostname", "path", "origin"}
	checkNames    = []string{"HasPrefix", "HasSuffix", "CutPrefix", "CutSuffix", "TrimPrefix", "TrimSuffix", "Contains",
		"Index"}
)

func runReplace(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		isReplace := len(call.Args) == 4 && support.IsFunc(pass.TypesInfo, call, "strings", "Replace")
		if support.InTestFile(pass, call) || !isReplace {
			continue
		}
		if !isOnce(pass.TypesInfo, call.Args[3]) {
			continue
		}
		message := replaceMessage(pass.TypesInfo, call.Args[1], call.Args[2])
		if message == "" {
			continue
		}
		if function, ok := support.EnclosingFunc(cursor); ok && checksPattern(pass.TypesInfo, function.Node(), call) {
			continue
		}
		pass.Reportf(call.Pos(), "%s", message)
	}
	return nil, nil
}

func isOnce(info *types.Info, expr ast.Expr) bool {
	value := info.Types[expr].Value
	return value != nil && value.Kind() == constant.Int && value.ExactString() == "1"
}

func replaceMessage(info *types.Info, pattern, replacement ast.Expr) string {
	if literal, ok := constString(info, pattern); ok {
		if empty, isConstant := constString(info, replacement); isConstant && empty == "" &&
			suffixPattern.MatchString(literal) {
			return suffixReplaceMessage
		}
		return ""
	}
	if isPrefixValue(info, pattern) {
		return prefixReplaceMessage
	}
	return ""
}

func isPrefixValue(info *types.Info, pattern ast.Expr) bool {
	if isDirectoryName(pattern) {
		return true
	}
	var receiver ast.Expr
	switch typed := ast.Unparen(pattern).(type) {
	case *ast.SelectorExpr:
		receiver = typed.X
	case *ast.CallExpr:
		if selector, ok := typed.Fun.(*ast.SelectorExpr); ok {
			receiver = selector.X
		}
	}
	words := support.WordsOf(nameOf(pattern))
	return receiver != nil && len(words) > 0 && support.IsNamed(info.TypeOf(receiver), "net/url", "URL") &&
		slices.Contains(urlParts, words[0])
}

func checksPattern(info *types.Info, function ast.Node, call *ast.CallExpr) bool {
	pattern := text(call.Args[1])
	found := false
	ast.Inspect(function, func(node ast.Node) bool {
		other, ok := node.(*ast.CallExpr)
		if ok && other != call && len(other.Args) >= 2 && text(other.Args[1]) == pattern {
			found = found || slices.Contains(checkNames, nameOf(other.Fun))
		}
		return !found
	})
	return found
}
