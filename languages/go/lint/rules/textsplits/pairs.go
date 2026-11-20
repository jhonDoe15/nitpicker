package textsplits

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var pairAnalyzer = &analysis.Analyzer{
	Name:     "pair_split_drops_rest",
	Doc:      "reports a key:value or key=value text split on its separator and read as two parts",
	Requires: support.Requires,
	Run:      runPair,
}

const pairMessage = "this splits on `%s` and reads the second part, which silently drops everything after the next " +
	"`%s` (a URL, a message with several colons, base64 padding): use `strings.Cut(text, \"%s\")`, " +
	"`strings.SplitN(text, \"%s\", 2)`, or reject any other part count (`len(parts) != 2`)"

func pairSeparator(info *types.Info, call *ast.CallExpr) (string, bool) {
	if !support.IsFunc(info, call, "strings", "Split") || len(call.Args) != 2 {
		return "", false
	}
	separator, ok := constString(info, call.Args[1])
	if !ok || (separator != ":" && separator != "=") {
		return "", false
	}
	_, constant := constString(info, call.Args[0])
	return separator, !constant && !clockName.MatchString(nameOf(call.Args[0]))
}

func isIndexOne(info *types.Info, index *ast.IndexExpr) bool {
	value, ok := intConst(info, index.Index)
	return ok && value == 1
}

func countsRest(operator token.Token, value int64) bool {
	return value >= 3 || value == 2 && operator != token.LSS && operator != token.LEQ
}

func restHandled(pass *analysis.Pass, body ast.Node, parts types.Object) bool {
	handled := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.SliceExpr:
			ident, ok := ast.Unparen(typed.X).(*ast.Ident)
			handled = handled || ok && pass.TypesInfo.Uses[ident] == parts
		case *ast.BinaryExpr:
			for _, pair := range [][2]ast.Expr{{typed.X, typed.Y}, {typed.Y, typed.X}} {
				length, ok := ast.Unparen(pair[0]).(*ast.CallExpr)
				if !ok || !support.IsBuiltin(pass.TypesInfo, length, "len") || len(length.Args) != 1 {
					continue
				}
				ident, isIdent := ast.Unparen(length.Args[0]).(*ast.Ident)
				value, isConst := intConst(pass.TypesInfo, pair[1])
				if isIdent && pass.TypesInfo.Uses[ident] == parts && isConst && countsRest(typed.Op, value) {
					handled = true
				}
			}
		}
		return !handled
	})
	return handled
}

func runPair(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.IndexExpr)(nil), (*ast.AssignStmt)(nil)) {
		node := cursor.Node()
		if support.InTestFile(pass, node) {
			continue
		}
		switch typed := node.(type) {
		case *ast.IndexExpr:
			call, ok := ast.Unparen(typed.X).(*ast.CallExpr)
			if !ok || !isIndexOne(pass.TypesInfo, typed) {
				continue
			}
			if separator, ok := pairSeparator(pass.TypesInfo, call); ok {
				pass.Reportf(call.Pos(), pairMessage, separator, separator, separator, separator)
			}
		case *ast.AssignStmt:
			if len(typed.Lhs) != 1 || len(typed.Rhs) != 1 || typed.Tok != token.DEFINE {
				continue
			}
			call, isCall := ast.Unparen(typed.Rhs[0]).(*ast.CallExpr)
			name, isName := typed.Lhs[0].(*ast.Ident)
			if !isCall || !isName {
				continue
			}
			separator, ok := pairSeparator(pass.TypesInfo, call)
			if !ok {
				continue
			}
			parts := pass.TypesInfo.Defs[name]
			body := functionBody(cursor)
			reads := false
			ast.Inspect(body, func(each ast.Node) bool {
				index, isIndex := each.(*ast.IndexExpr)
				if ident, ok := ast.Unparen(indexTarget(index)).(*ast.Ident); isIndex && ok &&
					pass.TypesInfo.Uses[ident] == parts && isIndexOne(pass.TypesInfo, index) {
					reads = true
				}
				return true
			})
			if reads && !restHandled(pass, body, parts) {
				pass.Reportf(call.Pos(), pairMessage, separator, separator, separator, separator)
			}
		}
	}
	return nil, nil
}

func indexTarget(index *ast.IndexExpr) ast.Expr {
	if index == nil {
		return &ast.BadExpr{}
	}
	return index.X
}
