package textsplits

import (
	"go/ast"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var lineAnalyzer = &analysis.Analyzer{
	Name:     "newline_only_line_split",
	Doc:      "reports text read from a file and split on a newline only",
	Requires: support.Requires,
	Run:      runLines,
}

const lineMessage = "this splits text read from a file on `\\n` only, so every line of a CRLF file keeps a trailing " +
	"`\\r` and a lone `\\r` does not split at all: read with `bufio.Scanner` (it drops `\\r\\n`), or normalise first " +
	"(`strings.ReplaceAll(text, \"\\r\\n\", \"\\n\")`) or trim each line with `strings.TrimSuffix(line, \"\\r\")`"

func fileOrigin(pass *analysis.Pass, sources map[types.Object]ast.Expr, expr ast.Expr, depth int) bool {
	info := pass.TypesInfo
	if depth > 4 {
		return false
	}
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		source, ok := sources[info.Uses[typed]]
		return ok && fileOrigin(pass, sources, source, depth+1)
	case *ast.CallExpr:
		if _, ok := isCall(info, typed, "os", "ReadFile"); ok {
			return true
		}
		if _, ok := isCall(info, typed, "io/ioutil", "ReadFile"); ok {
			return true
		}
		if _, ok := isCall(info, typed, "io", "ReadAll"); ok && len(typed.Args) == 1 {
			return support.IsNamed(info.TypeOf(typed.Args[0]), "os", "File")
		}
		if operand, ok := conversionOperand(info, typed); ok {
			return fileOrigin(pass, sources, operand, depth+1)
		}
		for _, path := range []string{"strings", "bytes"} {
			if call, ok := isCall(info, typed, path, "TrimSpace", "Trim", "TrimLeft", "TrimRight", "TrimPrefix",
				"TrimSuffix", "ToLower", "ToUpper"); ok && len(call.Args) > 0 {
				return fileOrigin(pass, sources, call.Args[0], depth+1)
			}
		}
	}
	return false
}

func readSources(pass *analysis.Pass) map[types.Object]ast.Expr {
	sources := map[types.Object]ast.Expr{}
	counts := map[types.Object]int{}
	for cursor := range support.Root(pass).Preorder((*ast.AssignStmt)(nil)) {
		statement := cursor.Node().(*ast.AssignStmt)
		for position, target := range statement.Lhs {
			if ident, ok := target.(*ast.Ident); ok && ident.Name != "_" {
				object := pass.TypesInfo.ObjectOf(ident)
				counts[object]++
				switch {
				case len(statement.Lhs) == len(statement.Rhs):
					sources[object] = statement.Rhs[position]
				case len(statement.Rhs) == 1 && position == 0:
					sources[object] = statement.Rhs[0]
				}
			}
		}
	}
	for object, count := range counts {
		if count != 1 {
			delete(sources, object)
		}
	}
	return sources
}

func newlineOnly(info *types.Info, expr ast.Expr) bool {
	if text, ok := constString(info, expr); ok {
		return text == "\n"
	}
	if operand, ok := conversionOperand(info, expr); ok {
		text, isConst := constString(info, operand)
		return isConst && text == "\n"
	}
	return false
}

func splitsOnNewline(info *types.Info, call *ast.CallExpr) (ast.Expr, bool) {
	for _, path := range []string{"strings", "bytes"} {
		for _, name := range []string{"Split", "SplitN", "Cut", "Index", "LastIndex"} {
			if support.IsFunc(info, call, path, name) && len(call.Args) >= 2 && newlineOnly(info, call.Args[1]) {
				return call.Args[0], true
			}
		}
	}
	return nil, false
}

func runLines(pass *analysis.Pass) (any, error) {
	sources := readSources(pass)
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		text, ok := splitsOnNewline(pass.TypesInfo, call)
		if !ok || support.InTestFile(pass, call) || !fileOrigin(pass, sources, text, 0) {
			continue
		}
		if mentionsLiteral(functionBody(cursor), pass.TypesInfo, func(value string) bool {
			return strings.Contains(value, "\r")
		}) || calls(functionBody(cursor), pass.TypesInfo, "bufio", "NewScanner") {
			continue
		}
		pass.Reportf(call.Pos(), "%s", lineMessage)
	}
	return nil, nil
}
