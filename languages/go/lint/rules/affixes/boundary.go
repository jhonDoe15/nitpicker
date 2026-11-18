package affixes

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

const (
	boundaryCharacters = "/\\.:-_@?#=&"
	leadingBoundaries  = ".@/"
	maxDepth           = 6
)

var separatorWords = []string{"sep", "separator", "slash", "delimiter"}

func namesSeparator(expr ast.Expr) bool {
	for _, word := range support.WordsOf(nameOf(expr)) {
		for _, separator := range separatorWords {
			if word == separator {
				return true
			}
		}
	}
	return false
}

func formatOf(info *types.Info, call *ast.CallExpr) (string, bool) {
	if len(call.Args) == 0 || !(support.IsFunc(info, call, "fmt", "Sprintf")) {
		return "", false
	}
	return constString(info, call.Args[0])
}

func callEndsWithBoundary(info *types.Info, call *ast.CallExpr, depth int) bool {
	if namesSeparator(call.Fun) {
		return true
	}
	if format, ok := formatOf(info, call); ok {
		if verb := strings.LastIndex(format, "%"); verb >= 0 && len(format)-verb == 2 {
			return endsWithBoundary(info, call.Args[len(call.Args)-1], depth+1)
		}
		return format == "" || strings.ContainsRune(boundaryCharacters, rune(format[len(format)-1]))
	}
	joined := nameOf(call.Fun) == "Join" || len(call.Args) == 1
	return joined && len(call.Args) > 0 && endsWithBoundary(info, call.Args[len(call.Args)-1], depth+1)
}

func endsWithBoundary(info *types.Info, expr ast.Expr, depth int) bool {
	if depth > maxDepth {
		return true
	}
	if value, ok := constString(info, expr); ok {
		return value == "" || strings.ContainsRune(boundaryCharacters, rune(value[len(value)-1]))
	}
	switch typed := ast.Unparen(expr).(type) {
	case *ast.BinaryExpr:
		return typed.Op == token.ADD && endsWithBoundary(info, typed.Y, depth+1)
	case *ast.CallExpr:
		return callEndsWithBoundary(info, typed, depth)
	}
	return namesSeparator(expr)
}

func startsWithBoundary(info *types.Info, expr ast.Expr) bool {
	if value, ok := constString(info, expr); ok {
		return value == "" || strings.ContainsRune(leadingBoundaries, rune(value[0]))
	}
	if binary, ok := ast.Unparen(expr).(*ast.BinaryExpr); ok && binary.Op == token.ADD {
		return startsWithBoundary(info, binary.X)
	}
	return false
}

func leadingText(info *types.Info, expr ast.Expr) (string, bool) {
	if value, ok := constString(info, expr); ok {
		return value, true
	}
	switch typed := ast.Unparen(expr).(type) {
	case *ast.BinaryExpr:
		if typed.Op == token.ADD {
			return leadingText(info, typed.X)
		}
	case *ast.CallExpr:
		if format, ok := formatOf(info, typed); ok {
			return format, true
		}
	}
	return "", false
}
