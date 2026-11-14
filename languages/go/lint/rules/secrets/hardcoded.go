package secrets

import (
	"go/ast"
	"go/token"
	"go/types"
	"strconv"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var hardcodedAnalyzer = &analysis.Analyzer{
	Name:     "hardcoded_secret",
	Doc:      "reports a secret-named value set to a string written in the source",
	Requires: support.Requires,
	Run:      runHardcoded,
}

var shapeAnalyzer = &analysis.Analyzer{
	Name:     "credential_shape",
	Doc:      "reports a string literal shaped like a real credential",
	Requires: support.Requires,
	Run:      runShapes,
}

const (
	hardcodedMessage = "`%s` holds a secret written in the source, so everyone who can read the code has it: " +
		"read it from the environment or a secret store where the program starts, and pass it in"
	shapeMessage = "this string has the shape of a real credential (an access key, a token or a private key): " +
		"remove it, rotate it, and read it from the environment or a secret store"
)

type pair struct {
	name  string
	value ast.Expr
}

func runHardcoded(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		reported := map[token.Pos]bool{}
		for _, each := range pairs(pass.TypesInfo, file) {
			if !isSecretName(each.name) {
				continue
			}
			for _, literal := range literalTexts(pass.TypesInfo, each.value) {
				if !reported[literal.at] && isHardcodedSecret(literal.text, each.name) {
					reported[literal.at] = true
					pass.Reportf(literal.at, hardcodedMessage, each.name)
				}
			}
		}
	}
	return nil, nil
}

func runShapes(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.BasicLit)(nil)) {
		literal := cursor.Node().(*ast.BasicLit)
		if literal.Kind != token.STRING || support.InTestFile(pass, literal) {
			continue
		}
		if text, err := strconv.Unquote(literal.Value); err == nil && hasCredentialShape(text) {
			pass.Reportf(literal.Pos(), "%s", shapeMessage)
		}
	}
	return nil, nil
}

func pairs(info *types.Info, file *ast.File) []pair {
	found := []pair{}
	ast.Inspect(file, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.ValueSpec:
			for index, name := range each.Names {
				if index < len(each.Values) {
					found = append(found, pair{name.Name, each.Values[index]})
				}
			}
		case *ast.AssignStmt:
			if len(each.Lhs) == len(each.Rhs) {
				for index, target := range each.Lhs {
					found = append(found, pair{targetName(target), each.Rhs[index]})
				}
			}
		case *ast.KeyValueExpr:
			found = append(found, pair{targetName(each.Key), each.Value})
		case *ast.CallExpr:
			found = append(found, callPairs(info, each)...)
		case *ast.FuncDecl:
			found = append(found, returnedPairs(each)...)
		}
		return true
	})
	return found
}

func targetName(target ast.Expr) string {
	switch each := ast.Unparen(target).(type) {
	case *ast.Ident:
		return each.Name
	case *ast.SelectorExpr:
		return each.Sel.Name
	case *ast.IndexExpr:
		return stringValue(each.Index)
	case *ast.BasicLit:
		return stringValue(each)
	}
	return ""
}

func stringValue(expression ast.Expr) string {
	literal, ok := ast.Unparen(expression).(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return ""
	}
	text, _ := strconv.Unquote(literal.Value)
	return text
}

func callPairs(info *types.Info, call *ast.CallExpr) []pair {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return nil
	}
	key, value := -1, -1
	switch support.CalleePackage(callee) + "." + callee.Name() {
	case "os.Setenv", "flag.String":
		key, value = 0, 1
	case "flag.StringVar":
		key, value = 1, 2
	}
	if callee.Name() == "SetDefault" && len(call.Args) == 2 {
		key, value = 0, 1
	}
	if key < 0 || len(call.Args) <= value {
		return nil
	}
	return []pair{{stringValue(call.Args[key]), call.Args[value]}}
}

func returnedPairs(function *ast.FuncDecl) []pair {
	if function.Body == nil || len(function.Body.List) != 1 {
		return nil
	}
	result, ok := function.Body.List[0].(*ast.ReturnStmt)
	if !ok || len(result.Results) != 1 {
		return nil
	}
	return []pair{{function.Name.Name, result.Results[0]}}
}

type literalText struct {
	text string
	at   token.Pos
}

func literalTexts(info *types.Info, value ast.Expr) []literalText {
	value = ast.Unparen(value)
	if text, folded := foldedText(info, value); folded {
		return []literalText{{text, value.Pos()}}
	}
	call, ok := value.(*ast.CallExpr)
	if !ok || !support.IsFunc(info, call, "cmp", "Or") {
		return nil
	}
	texts := []literalText{}
	for _, argument := range call.Args {
		texts = append(texts, literalTexts(info, argument)...)
	}
	return texts
}

func foldedText(info *types.Info, value ast.Expr) (string, bool) {
	switch each := ast.Unparen(value).(type) {
	case *ast.BasicLit:
		if each.Kind != token.STRING {
			return "", false
		}
		text, err := strconv.Unquote(each.Value)
		return text, err == nil
	case *ast.BinaryExpr:
		left, leftOk := foldedText(info, each.X)
		right, rightOk := foldedText(info, each.Y)
		return left + right, each.Op == token.ADD && leftOk && rightOk
	case *ast.CallExpr:
		if len(each.Args) == 1 && info.Types[each.Fun].IsType() {
			return foldedText(info, each.Args[0])
		}
	}
	return "", false
}
