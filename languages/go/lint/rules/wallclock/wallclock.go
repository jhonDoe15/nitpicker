package wallclock

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "wall_clock_elapsed",
	Doc:      "reports elapsed time measured as a difference of wall-clock Unix timestamps",
	Requires: support.Requires,
	Run:      run,
}

const message = "`%s` is a wall-clock Unix timestamp that is only used to measure elapsed time, but the wall clock " +
	"jumps with NTP corrections and clock changes, so a timeout fires early or never and a duration turns " +
	"negative: keep the `time.Time` and use `time.Since(%s)`, which reads the monotonic clock"

var recorders = regexp.MustCompile(`^(Observe|Record|Timing|Histogram)`)

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if declaration, ok := cursor.Node().(*ast.FuncDecl); ok && declaration.Body != nil {
			check(pass, declaration.Body)
		} else if literal, ok := cursor.Node().(*ast.FuncLit); ok {
			check(pass, literal.Body)
		}
	}
	return nil, nil
}

func isUnixRead(pass *analysis.Pass, expression ast.Expr) bool {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok {
		return false
	}
	method, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || (method.Sel.Name != "Unix" && method.Sel.Name != "UnixNano" && method.Sel.Name != "UnixMilli" &&
		method.Sel.Name != "UnixMicro") {
		return false
	}
	now, ok := method.X.(*ast.CallExpr)
	return ok && support.IsFunc(pass.TypesInfo, now, "time", "Now")
}

func starts(pass *analysis.Pass, body *ast.BlockStmt) map[types.Object]*ast.Ident {
	counts := map[types.Object]int{}
	found := map[types.Object]*ast.Ident{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for index, left := range assign.Lhs {
			ident, isIdent := left.(*ast.Ident)
			if !isIdent {
				continue
			}
			object := pass.TypesInfo.Defs[ident]
			if object == nil {
				object = pass.TypesInfo.Uses[ident]
			}
			counts[object]++
			if assign.Tok == token.DEFINE && isUnixRead(pass, assign.Rhs[index]) {
				found[object] = ident
			}
		}
		return true
	})
	for object := range found {
		if counts[object] != 1 {
			delete(found, object)
		}
	}
	return found
}

func check(pass *analysis.Pass, body *ast.BlockStmt) {
	held := starts(pass, body)
	if len(held) == 0 {
		return
	}
	parents := parentsOf(body)
	for object, name := range held {
		var uses []*ast.Ident
		ast.Inspect(body, func(node ast.Node) bool {
			if ident, ok := node.(*ast.Ident); ok && pass.TypesInfo.Uses[ident] == object {
				uses = append(uses, ident)
			}
			return true
		})
		sunk, pure := false, len(uses) > 0
		for _, use := range uses {
			difference := differenceOf(pass, parents, use, held)
			if difference == nil {
				pure = false
				break
			}
			sunk = sunk || reachesSink(pass, parents, body, difference)
		}
		if pure && sunk {
			pass.Reportf(name.Pos(), message, name.Name, name.Name)
		}
	}
}

func parentsOf(root ast.Node) map[ast.Node]ast.Node {
	parents := map[ast.Node]ast.Node{}
	var stack []ast.Node
	ast.Inspect(root, func(node ast.Node) bool {
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
	return parents
}

func differenceOf(
	pass *analysis.Pass,
	parents map[ast.Node]ast.Node,
	use *ast.Ident,
	held map[types.Object]*ast.Ident,
) *ast.BinaryExpr {
	binary, ok := parents[use].(*ast.BinaryExpr)
	if !ok || binary.Op != token.SUB || binary.Y != ast.Expr(use) {
		return nil
	}
	other := binary.X
	if isUnixRead(pass, other) {
		return binary
	}
	if ident, isIdent := other.(*ast.Ident); isIdent {
		if _, isStart := held[pass.TypesInfo.Uses[ident]]; isStart {
			return binary
		}
	}
	return nil
}

func isSink(parents map[ast.Node]ast.Node, node ast.Node) bool {
	for current := node; current != nil; current = parents[current] {
		parent := parents[current]
		switch each := parent.(type) {
		case *ast.ParenExpr:
			continue
		case *ast.BinaryExpr:
			switch each.Op {
			case token.LSS, token.GTR, token.LEQ, token.GEQ:
				return true
			case token.MUL, token.QUO:
				continue
			}
			return false
		case *ast.CallExpr:
			if selector, ok := each.Fun.(*ast.SelectorExpr); ok && recorders.MatchString(selector.Sel.Name) {
				return true
			}
			if _, conversion := each.Fun.(*ast.SelectorExpr); !conversion {
				continue
			}
			return false
		default:
			return false
		}
	}
	return false
}

func reachesSink(
	pass *analysis.Pass,
	parents map[ast.Node]ast.Node,
	body *ast.BlockStmt,
	difference *ast.BinaryExpr,
) bool {
	if isSink(parents, difference) {
		return true
	}
	assign, ok := parents[difference].(*ast.AssignStmt)
	if !ok || len(assign.Lhs) != 1 {
		return false
	}
	name, ok := assign.Lhs[0].(*ast.Ident)
	if !ok {
		return false
	}
	object := pass.TypesInfo.Defs[name]
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if ident, isIdent := node.(*ast.Ident); isIdent && object != nil && pass.TypesInfo.Uses[ident] == object {
			found = found || isSink(parents, ident)
		}
		return !found
	})
	return found
}
