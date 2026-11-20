package textsplits

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var cutAnalyzer = &analysis.Analyzer{
	Name:     "byte_cut_splits_rune",
	Doc:      "reports a string cut at a byte length under a length guard, which can split a multi-byte character",
	Requires: support.Requires,
	Run:      runCut,
}

const cutMessage = "this cuts a string at a length counted in bytes, so a cut inside a multi-byte character (an " +
	"accent, CJK text, an emoji) leaves invalid UTF-8 that renders as a replacement character and " +
	"fails JSON and database writes: cut on runes (`string([]rune(text)[:max])`), step back with " +
	"`utf8.RuneStart`, or use a grapheme library; text that is ASCII by construction (ids, hashes, " +
	"base64) is fine"

var asciiName = regexp.MustCompile(`(?i)hash|hex|base64|uuid|sha\d*|digest|slug|token|^id$|[a-z]Id$|checksum`)

var textName = regexp.MustCompile(`(?i)title|description|^desc|message|^msg|text|summary|label|body|content`)

var ellipsis = regexp.MustCompile(`\.\.\.|…|truncated`)

func cutBound(info *types.Info, slice *ast.SliceExpr) (ast.Expr, bool) {
	if slice.Slice3 || slice.High == nil || !isStringType(info.TypeOf(slice.X)) {
		return nil, false
	}
	if low, ok := intConst(info, slice.Low); slice.Low != nil && (!ok || low != 0) {
		return nil, false
	}
	if high, ok := intConst(info, slice.High); ok && high <= 1 {
		return nil, false
	}
	return slice.High, true
}

func lengthOf(info *types.Info, expr ast.Expr, receiver string) bool {
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	return ok && support.IsBuiltin(info, call, "len") && len(call.Args) == 1 &&
		types.ExprString(call.Args[0]) == receiver
}

func comparedBound(info *types.Info, test ast.Expr, receiver string, over bool) string {
	binary, ok := ast.Unparen(test).(*ast.BinaryExpr)
	if !ok {
		return ""
	}
	if binary.Op == token.LAND {
		if bound := comparedBound(info, binary.X, receiver, over); bound != "" {
			return bound
		}
		return comparedBound(info, binary.Y, receiver, over)
	}
	grows, shrinks := binary.Op == token.GTR || binary.Op == token.GEQ, binary.Op == token.LSS || binary.Op == token.LEQ
	if lengthOf(info, binary.X, receiver) && (over && grows || !over && shrinks) {
		return types.ExprString(binary.Y)
	}
	if lengthOf(info, binary.Y, receiver) && (over && shrinks || !over && grows) {
		return types.ExprString(binary.X)
	}
	return ""
}

func inside(outer, inner ast.Node) bool {
	return outer.Pos() <= inner.Pos() && inner.End() <= outer.End()
}

func leaves(block *ast.BlockStmt) bool {
	if len(block.List) == 0 {
		return false
	}
	switch last := block.List[len(block.List)-1].(type) {
	case *ast.ReturnStmt:
		return true
	case *ast.ExprStmt:
		call, ok := last.X.(*ast.CallExpr)
		return ok && types.ExprString(call.Fun) == "panic"
	}
	return false
}

func guardBound(info *types.Info, cursor inspector.Cursor, receiver string) string {
	node := cursor.Node()
	for ancestor := range cursor.Enclosing() {
		switch typed := ancestor.Node().(type) {
		case *ast.IfStmt:
			if inside(typed.Body, node) {
				if bound := comparedBound(info, typed.Cond, receiver, true); bound != "" {
					return bound
				}
			}
		case *ast.BlockStmt:
			for _, statement := range typed.List {
				if statement.End() > node.Pos() {
					break
				}
				if guard, ok := statement.(*ast.IfStmt); ok && guard.Else == nil && leaves(guard.Body) {
					if bound := comparedBound(info, guard.Cond, receiver, false); bound != "" {
						return bound
					}
				}
			}
		}
	}
	return ""
}

func runeAware(pass *analysis.Pass, body ast.Node) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok && !found {
			if operand, isConversion := conversionOperand(pass.TypesInfo, call); isConversion {
				slice, isSlice := types.Unalias(pass.TypesInfo.TypeOf(call)).Underlying().(*types.Slice)
				found = isSlice && isRune(slice.Elem()) && isStringType(pass.TypesInfo.TypeOf(operand))
			}
		}
		if selector, ok := node.(*ast.SelectorExpr); ok && !found {
			if ident, isIdent := selector.X.(*ast.Ident); isIdent {
				if name, isPackage := pass.TypesInfo.Uses[ident].(*types.PkgName); isPackage {
					path := name.Imported().Path()
					found = path == "unicode/utf8" || strings.Contains(path, "uniseg") || strings.Contains(path, "grapheme")
				}
			}
		}
		return !found
	})
	return found
}

func shownAsText(info *types.Info, cursor inspector.Cursor, slice *ast.SliceExpr) bool {
	parent, ok := cursor.Parent().Node().(*ast.BinaryExpr)
	if ok && (parent.Op == token.EQL || parent.Op == token.NEQ) {
		return false
	}
	if ok && parent.Op == token.ADD {
		other := parent.X
		if ast.Unparen(parent.X) == ast.Node(slice) {
			other = parent.Y
		}
		if text, isConst := constString(info, other); isConst && ellipsis.MatchString(text) {
			return true
		}
	}
	return textName.MatchString(nameOf(slice.X))
}

func inErrorText(info *types.Info, cursor inspector.Cursor) bool {
	for ancestor := range cursor.Enclosing() {
		if _, isStatement := ancestor.Node().(ast.Stmt); isStatement {
			return false
		}
		if call, isCall := ancestor.Node().(*ast.CallExpr); isCall &&
			(support.IsFunc(info, call, "fmt", "Errorf") || support.IsFunc(info, call, "errors", "New")) {
			return true
		}
	}
	return false
}

func runCut(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.SliceExpr)(nil)) {
		slice := cursor.Node().(*ast.SliceExpr)
		high, ok := cutBound(pass.TypesInfo, slice)
		if !ok || support.InTestFile(pass, slice) || asciiName.MatchString(nameOf(slice.X)) ||
			!shownAsText(pass.TypesInfo, cursor, slice) || inErrorText(pass.TypesInfo, cursor) {
			continue
		}
		bound := guardBound(pass.TypesInfo, cursor, types.ExprString(slice.X))
		if bound == "" || !strings.Contains(types.ExprString(high), bound) || runeAware(pass, functionBody(cursor)) {
			continue
		}
		pass.Reportf(slice.Pos(), "%s", cutMessage)
	}
	return nil, nil
}

func isRune(typ types.Type) bool {
	basic, ok := typ.Underlying().(*types.Basic)
	return ok && basic.Kind() == types.Int32
}
