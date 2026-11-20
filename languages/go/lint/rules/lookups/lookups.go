package lookups

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "case_mismatched_lookup",
	Doc:      "reports a case-normalized key looked up in a collection that is not normalized the same way",
	Requires: support.Requires,
	Run:      run,
}

const (
	originalMessage = "The key is %s-cased but `%s` holds values in their original case, so any value that is not " +
		"already %s-case never matches: normalize the keys where the collection is built, or compare " +
		"case-insensitively (`strings.EqualFold`)"
	rawMessage = "`%s` is filled with the %s-cased `%s` but looked up with `%s` as written, so a value with other " +
		"capitals misses: normalize the key on both sides"
)

type finder struct {
	pass  *analysis.Pass
	inits map[types.Object]ast.Expr
}

func run(pass *analysis.Pass) (any, error) {
	found := &finder{pass: pass, inits: initializers(pass)}
	for cursor := range support.Root(pass).Preorder((*ast.IndexExpr)(nil), (*ast.CallExpr)(nil)) {
		node := cursor.Node()
		if support.InTestFile(pass, node) {
			continue
		}
		collection, key := found.lookup(cursor)
		if collection == nil {
			continue
		}
		if casing, _, ok := found.normalized(key); ok {
			if found.originalCase(cursor, collection, casing) {
				pass.Reportf(node.Pos(), originalMessage, casing, text(collection), casing)
			}
		} else if casing := found.filledCasing(cursor, collection, key); casing != "" {
			pass.Reportf(node.Pos(), rawMessage, text(collection), casing, text(key), text(key))
		}
	}
	return nil, nil
}

func text(expr ast.Expr) string { return types.ExprString(expr) }

func initializers(pass *analysis.Pass) map[types.Object]ast.Expr {
	inits := map[types.Object]ast.Expr{}
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			switch typed := node.(type) {
			case *ast.AssignStmt:
				if typed.Tok == token.DEFINE && len(typed.Lhs) == len(typed.Rhs) {
					for index, left := range typed.Lhs {
						if ident, ok := left.(*ast.Ident); ok {
							inits[pass.TypesInfo.Defs[ident]] = typed.Rhs[index]
						}
					}
				}
			case *ast.ValueSpec:
				if len(typed.Names) == len(typed.Values) {
					for index, name := range typed.Names {
						inits[pass.TypesInfo.Defs[name]] = typed.Values[index]
					}
				}
			}
			return true
		})
	}
	return inits
}

func (found *finder) lookup(cursor inspector.Cursor) (ast.Expr, ast.Expr) {
	switch typed := cursor.Node().(type) {
	case *ast.IndexExpr:
		_, isMap := types.Unalias(found.pass.TypesInfo.TypeOf(typed.X)).Underlying().(*types.Map)
		if isMap && !assigned(cursor) {
			return typed.X, typed.Index
		}
	case *ast.CallExpr:
		isSlices := support.IsFunc(found.pass.TypesInfo, typed, "slices", "Contains") ||
			support.IsFunc(found.pass.TypesInfo, typed, "slices", "Index")
		if isSlices && len(typed.Args) == 2 {
			return typed.Args[0], typed.Args[1]
		}
	}
	return nil, nil
}

func assigned(cursor inspector.Cursor) bool {
	statement, ok := cursor.Parent().Node().(*ast.AssignStmt)
	if !ok {
		return false
	}
	for _, left := range statement.Lhs {
		if left == cursor.Node() {
			return true
		}
	}
	return false
}

func (found *finder) normalized(expr ast.Expr) (string, ast.Expr, bool) {
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	if !ok || len(call.Args) != 1 {
		return "", nil, false
	}
	switch {
	case support.IsFunc(found.pass.TypesInfo, call, "strings", "ToLower"):
		return "lower", call.Args[0], true
	case support.IsFunc(found.pass.TypesInfo, call, "strings", "ToUpper"):
		return "upper", call.Args[0], true
	}
	return "", nil, false
}

func hasCase(value, casing string) bool {
	if casing == "lower" {
		return value != strings.ToLower(value)
	}
	return value != strings.ToUpper(value)
}

func (found *finder) literalKeys(expr ast.Expr) ([]string, bool) {
	literal, ok := ast.Unparen(expr).(*ast.CompositeLit)
	if !ok || len(literal.Elts) == 0 {
		return nil, false
	}
	var keys []string
	for _, element := range literal.Elts {
		if pair, isPair := element.(*ast.KeyValueExpr); isPair {
			element = pair.Key
		}
		value := found.pass.TypesInfo.Types[element].Value
		if value == nil || value.Kind() != constant.String {
			return nil, false
		}
		keys = append(keys, constant.StringVal(value))
	}
	return keys, true
}

func (found *finder) originalCase(cursor inspector.Cursor, collection ast.Expr, casing string) bool {
	ident, ok := collection.(*ast.Ident)
	if !ok {
		return false
	}
	object := found.pass.TypesInfo.ObjectOf(ident)
	if keys, isLiteral := found.literalKeys(found.inits[object]); isLiteral {
		for _, key := range keys {
			if hasCase(key, casing) {
				return true
			}
		}
		return false
	}
	return found.filledFromParameter(cursor, ident)
}
