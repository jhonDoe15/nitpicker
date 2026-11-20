package preconditions

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"regexp"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "precondition_message_names_other_value",
	Doc:      "reports a precondition whose message names a different variable than the one it checks",
	Requires: support.Requires,
	Run:      run,
}

const message = "The check is on `%s` but its message names `%s`, so a failure points at the wrong value: " +
	"check `%s`, or change the message to name `%s`"

var subject = regexp.MustCompile(`(?i)^[` + "`" + `'"]?([A-Za-z_]\w*)[` + "`" + `'"]?\s+` +
	`(?:must|should|is|are|was|cannot|can't|can not|may not|has|have|required|needs|not)\b`)

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.IfStmt)(nil)) {
		branch := cursor.Node().(*ast.IfStmt)
		if support.InTestFile(pass, branch) || branch.Else != nil || branch.Init != nil {
			continue
		}
		names := checkedNames(pass.TypesInfo, branch.Cond)
		text, ok := failureMessage(pass.TypesInfo, branch.Body)
		if len(names) == 0 || !ok {
			continue
		}
		named := namedInScope(pass, cursor, text)
		if named != "" && mismatched(names, named, text) && !derived(cursor, names[0], named) {
			checked := strings.Join(names, ".")
			pass.Reportf(branch.If, message, checked, named, named, checked)
		}
	}
	return nil, nil
}

func checkedNames(info *types.Info, cond ast.Expr) []string {
	binary, ok := ast.Unparen(cond).(*ast.BinaryExpr)
	if !ok || binary.Op != token.EQL {
		return nil
	}
	operand := binary.X
	if call, isCall := operand.(*ast.CallExpr); isCall && len(call.Args) == 1 && support.IsBuiltin(info, call, "len") {
		operand = call.Args[0]
	}
	empty := isNil(info, binary.Y) || isEmptyString(info, binary.Y) || isZero(info, binary.Y)
	if !empty {
		return nil
	}
	return operandNames(operand)
}

func isNil(info *types.Info, expr ast.Expr) bool {
	return info.Types[expr].IsNil()
}

func isEmptyString(info *types.Info, expr ast.Expr) bool {
	value := info.Types[expr].Value
	return value != nil && value.Kind() == constant.String && constant.StringVal(value) == ""
}

func isZero(info *types.Info, expr ast.Expr) bool {
	value := info.Types[expr].Value
	return value != nil && value.Kind() == constant.Int && value.ExactString() == "0"
}

func operandNames(expr ast.Expr) []string {
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		return []string{typed.Name}
	case *ast.SelectorExpr:
		return append(operandNames(typed.X), typed.Sel.Name)
	}
	return nil
}

func failureMessage(info *types.Info, body *ast.BlockStmt) (string, bool) {
	if len(body.List) != 1 {
		return "", false
	}
	var call *ast.CallExpr
	switch typed := body.List[0].(type) {
	case *ast.ReturnStmt:
		if len(typed.Results) > 0 {
			call, _ = typed.Results[len(typed.Results)-1].(*ast.CallExpr)
		}
	case *ast.ExprStmt:
		call, _ = typed.X.(*ast.CallExpr)
	}
	if call != nil && support.IsBuiltin(info, call, "panic") && len(call.Args) == 1 {
		return constantText(info, call.Args[0])
	}
	if call != nil && len(call.Args) > 0 &&
		(support.IsFunc(info, call, "fmt", "Errorf") || support.IsFunc(info, call, "errors", "New")) {
		return constantText(info, call.Args[0])
	}
	return "", false
}

func constantText(info *types.Info, expr ast.Expr) (string, bool) {
	if call, ok := expr.(*ast.CallExpr); ok && len(call.Args) > 0 {
		return constantText(info, call.Args[0])
	}
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func normalize(name string) string {
	return strings.ToLower(regexp.MustCompile(`[^A-Za-z0-9]`).ReplaceAllString(name, ""))
}

func headWord(name string) string {
	words := support.WordsOf(name)
	if len(words) == 0 {
		return ""
	}
	return strings.TrimSuffix(words[len(words)-1], "s")
}

func namedInScope(pass *analysis.Pass, cursor inspector.Cursor, text string) string {
	match := subject.FindStringSubmatch(strings.TrimSpace(text))
	function, ok := support.EnclosingFunc(cursor)
	if match == nil || !ok {
		return ""
	}
	word := normalize(match[1])
	var scope []string
	for identifier, object := range pass.TypesInfo.Defs {
		_, isVariable := object.(*types.Var)
		inside := identifier.Pos() >= function.Node().Pos() && identifier.Pos() < function.Node().End()
		if isVariable && inside && identifier.Name != "_" {
			scope = append(scope, identifier.Name)
		}
	}
	slices.Sort(scope)
	for _, name := range scope {
		if normalize(name) == word {
			return name
		}
	}
	return ""
}

func derived(cursor inspector.Cursor, checked, named string) bool {
	function, ok := support.EnclosingFunc(cursor)
	if !ok {
		return false
	}
	found := false
	ast.Inspect(function.Node(), func(node ast.Node) bool {
		assignment, isAssignment := node.(*ast.AssignStmt)
		if isAssignment && assigns(assignment, checked) {
			for _, value := range assignment.Rhs {
				found = found || mentions(value, named)
			}
		}
		return !found
	})
	return found
}

func assigns(assignment *ast.AssignStmt, name string) bool {
	for _, left := range assignment.Lhs {
		if identifier, ok := left.(*ast.Ident); ok && identifier.Name == name {
			return true
		}
	}
	return false
}

func mentions(root ast.Node, name string) bool {
	found := false
	ast.Inspect(root, func(node ast.Node) bool {
		identifier, ok := node.(*ast.Ident)
		found = found || (ok && identifier.Name == name)
		return !found
	})
	return found
}

func mismatched(names []string, named, text string) bool {
	for _, name := range names {
		mentioned := regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(name) + `\b`).MatchString(text)
		if mentioned || headWord(name) == headWord(named) || normalize(name) == normalize(named) {
			return false
		}
	}
	return true
}
