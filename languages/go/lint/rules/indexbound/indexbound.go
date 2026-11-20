package indexbound

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "index_bound_off_by_one",
	Doc:      "reports a bounds check that lets the index equal to the length through before an index read",
	Requires: support.Requires,
	Run:      run,
}

const reject = "`%s` lets `%s == len(%s)` through, and `%s[%s]` is then out of range and panics: reject with `>=` " +
	"(`>` is right only for an insertion position)"

const accept = "`%s` accepts `%s == len(%s)`, and `%s[%s]` is then out of range and panics: accept with `<` " +
	"(`<=` is right only for an insertion position)"

type bound struct {
	expression *ast.BinaryExpr
	index      *ast.Ident
	owner      string
}

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		var body *ast.BlockStmt
		if declaration, ok := cursor.Node().(*ast.FuncDecl); ok {
			body = declaration.Body
		} else {
			body = cursor.Node().(*ast.FuncLit).Body
		}
		if body != nil {
			check(pass, body)
		}
	}
	return nil, nil
}

func boundOf(pass *analysis.Pass, expression ast.Expr, rejecting bool) *bound {
	binary, ok := ast.Unparen(expression).(*ast.BinaryExpr)
	if !ok {
		return nil
	}
	direct, flipped := token.GTR, token.LSS
	if !rejecting {
		direct, flipped = token.LEQ, token.GEQ
	}
	var indexSide, lengthSide ast.Expr
	switch binary.Op {
	case direct:
		indexSide, lengthSide = binary.X, binary.Y
	case flipped:
		indexSide, lengthSide = binary.Y, binary.X
	default:
		return nil
	}
	index, ok := ast.Unparen(indexSide).(*ast.Ident)
	call, isCall := ast.Unparen(lengthSide).(*ast.CallExpr)
	if !ok || !isCall || len(call.Args) != 1 || !support.IsBuiltin(pass.TypesInfo, call, "len") {
		return nil
	}
	if pass.TypesInfo.Uses[index] == nil || pass.TypesInfo.Types[index].Value != nil {
		return nil
	}
	return &bound{expression: binary, index: index, owner: types.ExprString(call.Args[0])}
}

func parts(expression ast.Expr, operator token.Token) []ast.Expr {
	binary, ok := ast.Unparen(expression).(*ast.BinaryExpr)
	if ok && binary.Op == operator {
		return append(parts(binary.X, operator), parts(binary.Y, operator)...)
	}
	return []ast.Expr{expression}
}

func reads(pass *analysis.Pass, roots []ast.Node, found *bound) bool {
	read := false
	for _, root := range roots {
		ast.Inspect(root, func(node ast.Node) bool {
			access, ok := node.(*ast.IndexExpr)
			if !ok {
				return !read
			}
			ident, isIdent := ast.Unparen(access.Index).(*ast.Ident)
			if isIdent && pass.TypesInfo.Uses[ident] == pass.TypesInfo.Uses[found.index] &&
				types.ExprString(access.X) == found.owner {
				read = true
			}
			return !read
		})
	}
	return read
}

func leaves(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.ReturnStmt, *ast.BranchStmt:
			found = true
		case *ast.CallExpr:
			if ident, ok := statement.Fun.(*ast.Ident); ok && ident.Name == "panic" {
				found = true
			}
		}
		return !found
	})
	return found
}

func settled(pass *analysis.Pass, body *ast.BlockStmt, found *bound) bool {
	object := pass.TypesInfo.Uses[found.index]
	text := types.ExprString(found.index)
	strict := map[string]bool{
		text + " >= len(" + found.owner + ")": true,
		text + " < len(" + found.owner + ")":  true,
		"len(" + found.owner + ") <= " + text: true,
		"len(" + found.owner + ") > " + text:  true,
	}
	result := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.BinaryExpr:
			result = result || strict[types.ExprString(statement)]
		case *ast.AssignStmt:
			for _, left := range statement.Lhs {
				if ident, ok := left.(*ast.Ident); ok && pass.TypesInfo.Uses[ident] == object {
					result = true
				}
			}
		case *ast.IncDecStmt:
			if ident, ok := statement.X.(*ast.Ident); ok && pass.TypesInfo.Uses[ident] == object {
				result = true
			}
		}
		return !result
	})
	return result
}

func report(pass *analysis.Pass, found *bound, rejecting bool) {
	format := accept
	if rejecting {
		format = reject
	}
	text := types.ExprString(found.expression)
	name := found.index.Name
	pass.Reportf(found.expression.Pos(), format, text, name, found.owner, found.owner, name)
}

func nodesOf(expressions []ast.Expr) []ast.Node {
	nodes := make([]ast.Node, len(expressions))
	for index, expression := range expressions {
		nodes[index] = expression
	}
	return nodes
}

func checkIf(pass *analysis.Pass, body *ast.BlockStmt, statement *ast.IfStmt, after []ast.Node) {
	rejecting := parts(statement.Cond, token.LOR)
	for at, part := range rejecting {
		found := boundOf(pass, part, true)
		if found == nil || settled(pass, body, found) {
			continue
		}
		roots := nodesOf(rejecting[at+1:])
		if statement.Else == nil && leaves(statement.Body) {
			roots = append(roots, after...)
		}
		if reads(pass, roots, found) {
			report(pass, found, true)
		}
	}
	accepting := parts(statement.Cond, token.LAND)
	for at, part := range accepting {
		found := boundOf(pass, part, false)
		roots := append(nodesOf(accepting[at+1:]), statement.Body)
		if found != nil && !settled(pass, body, found) && reads(pass, roots, found) {
			report(pass, found, false)
		}
	}
}

func checkChain(pass *analysis.Pass, body *ast.BlockStmt, expression *ast.BinaryExpr) {
	if expression.Op == token.LOR {
		operands := parts(expression, token.LOR)
		for at, part := range operands {
			found := boundOf(pass, part, true)
			if found != nil && !settled(pass, body, found) && reads(pass, nodesOf(operands[at+1:]), found) {
				report(pass, found, true)
			}
		}
		return
	}
	operands := parts(expression, token.LAND)
	for at, part := range operands {
		found := boundOf(pass, part, false)
		if found != nil && !settled(pass, body, found) && reads(pass, nodesOf(operands[at+1:]), found) {
			report(pass, found, false)
		}
	}
}

func check(pass *analysis.Pass, body *ast.BlockStmt) {
	conditions := map[ast.Expr]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.IfStmt:
			conditions[statement.Cond] = true
		case *ast.BlockStmt:
			for index, each := range statement.List {
				if branch, isIf := each.(*ast.IfStmt); isIf {
					var after []ast.Node
					for _, next := range statement.List[index+1:] {
						after = append(after, next)
					}
					checkIf(pass, body, branch, after)
				}
			}
		}
		return true
	})
	nested := map[ast.Expr]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		expression, ok := node.(*ast.BinaryExpr)
		if !ok || (expression.Op != token.LOR && expression.Op != token.LAND) {
			return true
		}
		if !nested[expression] && !conditions[expression] {
			checkChain(pass, body, expression)
		}
		for _, side := range []ast.Expr{expression.X, expression.Y} {
			if inner, isBinary := ast.Unparen(side).(*ast.BinaryExpr); isBinary && inner.Op == expression.Op {
				nested[inner] = true
			}
		}
		return true
	})
}
