package honesty

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var conditionalAnalyzer = &analysis.Analyzer{
	Name:     "conditional_assertion_in_test",
	Doc:      "reports an assertion that runs only on some paths of a test",
	Requires: support.Requires,
	Run:      runConditional,
}

const (
	branchMessage = "this assertion runs only when the test takes one path of the `%s` around it, so the test passes " +
		"when the code takes another: check the condition itself first (`if resp == nil { t.Fatal(...) }`), " +
		"then the value, or write one test per case"
	loopMessage = "this assertion is in a loop over a collection that can be empty, so the test can pass without " +
		"checking anything: loop over a literal table with one `t.Run` subtest per case, " +
		"or compare the whole collection at once (`slices.Equal`, `cmp.Diff`)"
)

type walker struct {
	pass   *analysis.Pass
	tables tables
}

func runConditional(pass *analysis.Pass) (any, error) {
	for _, found := range testFiles(pass) {
		check := walker{pass: pass, tables: tableLiterals(pass.TypesInfo, found.file)}
		for function := range found.judged {
			check.block(function.Body.List, false)
		}
	}
	return nil, nil
}

func (check walker) block(statements []ast.Stmt, later bool) {
	for index, statement := range statements {
		check.statement(statement, later || check.asserts(statements[index+1:]))
	}
}

func (check walker) asserts(statements []ast.Stmt) bool {
	for _, statement := range statements {
		if firstAssertion(check.pass.TypesInfo, statement) != nil {
			return true
		}
	}
	return false
}

func (check walker) statement(statement ast.Stmt, later bool) {
	switch each := statement.(type) {
	case *ast.IfStmt:
		check.ifStatement(each, later)
	case *ast.SwitchStmt:
		check.choice(each, each.Body, "switch", true, later)
	case *ast.TypeSwitchStmt:
		check.choice(each, each.Body, "switch", true, later)
	case *ast.SelectStmt:
		check.choice(each, each.Body, "select", false, later)
	case *ast.ForStmt:
		check.loop(each, each.Body, later)
	case *ast.RangeStmt:
		check.loop(each, each.Body, later)
	case *ast.BlockStmt:
		check.block(each.List, later)
	case *ast.LabeledStmt:
		check.statement(each.Stmt, later)
	default:
		check.literals(statement)
	}
}

func (check walker) literals(node ast.Node) {
	ast.Inspect(node, func(each ast.Node) bool {
		if literal, ok := each.(*ast.FuncLit); ok {
			check.block(literal.Body.List, false)
			return false
		}
		return true
	})
}

func (check walker) ifStatement(statement *ast.IfStmt, later bool) {
	info := check.pass.TypesInfo
	if statement.Init != nil {
		check.literals(statement.Init)
	}
	check.literals(statement.Cond)
	if !check.fails(statement.Body.List) && firstAssertion(info, statement.Body) != nil && !later &&
		firstAssertion(info, statement.Cond) == nil &&
		(statement.Else == nil || firstAssertion(info, statement.Else) == nil) {
		check.pass.Reportf(firstAssertion(info, statement.Body).Pos(), branchMessage, "if")
		return
	}
	check.block(statement.Body.List, later)
	if statement.Else != nil {
		check.statement(statement.Else, later)
	}
}

func (check walker) fails(statements []ast.Stmt) bool {
	for _, statement := range statements {
		expression, ok := statement.(*ast.ExprStmt)
		if !ok {
			continue
		}
		if call, isCall := ast.Unparen(expression.X).(*ast.CallExpr); isCall &&
			testingMethod(check.pass.TypesInfo, call, failures) {
			return true
		}
	}
	return false
}

func (check walker) choice(statement ast.Stmt, body *ast.BlockStmt, kind string, implicit, later bool) {
	info := check.pass.TypesInfo
	guarded, silent, defaulted := false, false, false
	for _, clause := range body.List {
		statements, isDefault := clauseBody(clause)
		asserts := firstAssertion(info, clause) != nil
		guarded = guarded || asserts && !check.fails(statements)
		silent = silent || !asserts
		defaulted = defaulted || isDefault
	}
	silent = silent || implicit && !defaulted
	if guarded && silent && !later {
		check.pass.Reportf(firstAssertion(info, statement).Pos(), branchMessage, kind)
		return
	}
	for _, clause := range body.List {
		statements, _ := clauseBody(clause)
		check.block(statements, later)
	}
}

func clauseBody(clause ast.Stmt) ([]ast.Stmt, bool) {
	switch each := clause.(type) {
	case *ast.CaseClause:
		return each.Body, each.List == nil
	case *ast.CommClause:
		return each.Body, each.Comm == nil
	}
	return nil, false
}

func (check walker) loop(statement ast.Stmt, body *ast.BlockStmt, later bool) {
	info := check.pass.TypesInfo
	if firstAssertion(info, body) == nil || check.fixedCount(statement) {
		check.block(body.List, later)
		return
	}
	if check.table(statement) {
		if outside := check.outsideSubtests(body); outside == nil {
			check.block(body.List, later)
			return
		}
	}
	check.pass.Reportf(firstAssertion(info, body).Pos(), "%s", loopMessage)
}

func (check walker) outsideSubtests(body *ast.BlockStmt) ast.Node {
	info := check.pass.TypesInfo
	var found ast.Node
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || found != nil {
			return found == nil
		}
		if subtestBody(info, call) != nil {
			return false
		}
		if isAssertion(info, call) {
			found = call
		}
		return found == nil
	})
	return found
}

func (check walker) fixedCount(statement ast.Stmt) bool {
	info := check.pass.TypesInfo
	switch each := statement.(type) {
	case *ast.ForStmt:
		if each.Cond == nil {
			return true
		}
		binary, ok := ast.Unparen(each.Cond).(*ast.BinaryExpr)
		return ok && runsOnce(binary.Op, start(info, each.Init), info.Types[binary.Y].Value)
	case *ast.RangeStmt:
		return positive(info, each.X)
	}
	return false
}

func positive(info *types.Info, expression ast.Expr) bool {
	value := info.Types[expression].Value
	return value != nil && value.Kind() == constant.Int && constant.Sign(value) > 0
}

func start(info *types.Info, init ast.Stmt) constant.Value {
	assign, ok := init.(*ast.AssignStmt)
	if !ok || len(assign.Rhs) != 1 {
		return nil
	}
	return info.Types[assign.Rhs[0]].Value
}

func runsOnce(operator token.Token, first, bound constant.Value) bool {
	if first == nil || bound == nil || first.Kind() != constant.Int || bound.Kind() != constant.Int {
		return false
	}
	switch operator {
	case token.LSS, token.GTR, token.LEQ, token.GEQ:
		return constant.Compare(first, operator, bound)
	}
	return false
}

func (check walker) table(statement ast.Stmt) bool {
	ranged, ok := statement.(*ast.RangeStmt)
	return ok && check.tables.literal(check.pass.TypesInfo, ranged.X)
}

type tables map[types.Object]bool

func tableLiterals(info *types.Info, file *ast.File) tables {
	found := tables{}
	changed := map[types.Object]bool{}
	ast.Inspect(file, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.ValueSpec:
			for index, name := range each.Names {
				if index < len(each.Values) && filled(each.Values[index]) {
					found[info.Defs[name]] = true
				}
			}
		case *ast.AssignStmt:
			for index, target := range each.Lhs {
				ident, ok := target.(*ast.Ident)
				if !ok {
					continue
				}
				if defined := info.Defs[ident]; defined != nil && len(each.Lhs) == len(each.Rhs) && filled(each.Rhs[index]) {
					found[defined] = true
				} else if used := info.Uses[ident]; used != nil {
					changed[used] = true
				}
			}
		}
		return true
	})
	for object := range changed {
		delete(found, object)
	}
	return found
}

func filled(expression ast.Expr) bool {
	literal, ok := ast.Unparen(expression).(*ast.CompositeLit)
	return ok && len(literal.Elts) > 0
}

func (found tables) literal(info *types.Info, expression ast.Expr) bool {
	if filled(expression) {
		return true
	}
	ident, ok := ast.Unparen(expression).(*ast.Ident)
	return ok && found[info.Uses[ident]]
}
