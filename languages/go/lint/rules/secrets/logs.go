package secrets

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var logAnalyzer = &analysis.Analyzer{
	Name:     "secret_in_log",
	Doc:      "reports a secret written to a log, the standard streams or an error message",
	Requires: support.Requires,
	Run:      runLogs,
}

const logMessage = "`%s` is a secret and this writes it where anyone who reads the logs or the error sees it: " +
	"log only that it is set, such as `slog.Bool(\"token_set\", token != \"\")`"

var (
	constantName = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
	statusWords  = []string{"has", "is"}
	textSinks    = []string{"fmt.Errorf", "errors.New", "fmt.Print", "fmt.Printf", "fmt.Println"}
	streamSinks  = []string{"fmt.Fprint", "fmt.Fprintf", "fmt.Fprintln"}
)

func runLogs(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) || !sink(pass.TypesInfo, call) {
			continue
		}
		reported := map[token.Pos]bool{}
		for _, leak := range leaks(pass.TypesInfo, call) {
			if !reported[leak.at] {
				reported[leak.at] = true
				pass.Reportf(leak.at, logMessage, leak.name)
			}
		}
	}
	return nil, nil
}

func sink(info *types.Info, call *ast.CallExpr) bool {
	if support.IsBuiltin(info, call, "panic") {
		return true
	}
	if _, isLogger := support.LoggerCall(info, call); isLogger && !nestedInLogger(info, call) {
		return true
	}
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return false
	}
	name := callee.Pkg().Path() + "." + callee.Name()
	if slices.Contains(streamSinks, name) {
		return len(call.Args) > 0 && standardStream(info, call.Args[0])
	}
	return slices.Contains(textSinks, name)
}

func nestedInLogger(info *types.Info, call *ast.CallExpr) bool {
	callee, _ := support.LoggerCall(info, call)
	return callee.Signature().Recv() == nil && callee.Signature().Results().Len() > 0
}

func standardStream(info *types.Info, writer ast.Expr) bool {
	selector, ok := ast.Unparen(writer).(*ast.SelectorExpr)
	if !ok {
		return false
	}
	variable, isVar := info.Uses[selector.Sel].(*types.Var)
	return isVar && variable.Pkg() != nil && variable.Pkg().Path() == "os" &&
		(variable.Name() == "Stdout" || variable.Name() == "Stderr")
}

type leak struct {
	name string
	at   token.Pos
}

func leaks(info *types.Info, call *ast.CallExpr) []leak {
	found := keyedLeaks(info, call)
	pending := slices.Clone(call.Args)
	for len(pending) > 0 {
		node := ast.Unparen(pending[0])
		pending = pending[1:]
		if name, ok := ownName(info, node); ok {
			found = append(found, leak{name, node.Pos()})
			continue
		}
		found = append(found, keyedLeaks(info, node)...)
		pending = append(pending, children(info, node)...)
	}
	return found
}

func ownName(info *types.Info, node ast.Expr) (string, bool) {
	name := ""
	switch each := node.(type) {
	case *ast.Ident:
		name = each.Name
		if _, constant := info.Uses[each].(*types.Const); constant {
			return "", false
		}
	case *ast.SelectorExpr:
		name = each.Sel.Name
		if _, constant := info.Uses[each.Sel].(*types.Const); constant {
			return "", false
		}
	case *ast.CallExpr:
		if support.IsFunc(info, each, "os", "Getenv") && len(each.Args) == 1 {
			return stringValue(each.Args[0]), isLoggedSecret(stringValue(each.Args[0]), true)
		}
		return "", false
	default:
		return "", false
	}
	return name, isLoggedSecret(name, false) && textual(info.TypeOf(node))
}

func isLoggedSecret(name string, key bool) bool {
	constant := !key && constantName.MatchString(name)
	return isSecretName(name) && !constant && !status(name)
}

func status(name string) bool {
	words := support.WordsOf(name)
	return len(words) > 0 && slices.Contains(statusWords, words[0])
}

func textual(typ types.Type) bool {
	if typ == nil {
		return false
	}
	switch underlying := typ.Underlying().(type) {
	case *types.Basic:
		return underlying.Info()&types.IsString != 0
	case *types.Slice:
		basic, ok := underlying.Elem().Underlying().(*types.Basic)
		return ok && basic.Kind() == types.Byte
	case *types.Pointer:
		return textual(underlying.Elem())
	case *types.Struct, *types.Map:
		return true
	}
	return false
}

func keyedLeaks(info *types.Info, node ast.Expr) []leak {
	call, ok := node.(*ast.CallExpr)
	if !ok {
		return nil
	}
	if _, isLogger := support.LoggerCall(info, call); !isLogger {
		return nil
	}
	found := []leak{}
	for index := 0; index+1 < len(call.Args); index++ {
		key := stringValue(call.Args[index])
		value := ast.Unparen(call.Args[index+1])
		if key != "" && isLoggedSecret(key, true) && namesValue(info, value) {
			found = append(found, leak{key, value.Pos()})
		}
	}
	return found
}

func namesValue(info *types.Info, value ast.Expr) bool {
	switch value.(type) {
	case *ast.Ident, *ast.SelectorExpr, *ast.CallExpr:
		return info.Types[value].Value == nil && textual(info.TypeOf(value)) && !status(nameOf(value))
	}
	return false
}

func nameOf(value ast.Expr) string {
	switch each := value.(type) {
	case *ast.Ident:
		return each.Name
	case *ast.SelectorExpr:
		return each.Sel.Name
	}
	return ""
}

func children(info *types.Info, node ast.Expr) []ast.Expr {
	switch each := node.(type) {
	case *ast.BinaryExpr:
		if each.Op == token.ADD {
			return []ast.Expr{each.X, each.Y}
		}
	case *ast.CompositeLit:
		values := []ast.Expr{}
		for _, element := range each.Elts {
			if pair, ok := element.(*ast.KeyValueExpr); ok {
				element = pair.Value
			}
			values = append(values, element)
		}
		return values
	case *ast.CallExpr:
		if formats(info, each) {
			return each.Args
		}
	case *ast.StarExpr:
		return []ast.Expr{each.X}
	}
	return nil
}

func formats(info *types.Info, call *ast.CallExpr) bool {
	if _, isLogger := support.LoggerCall(info, call); isLogger {
		return true
	}
	if len(call.Args) == 1 && info.Types[call.Fun].IsType() {
		return true
	}
	return support.IsFunc(info, call, "fmt", "Sprintf") || support.IsFunc(info, call, "fmt", "Sprint") ||
		support.IsFunc(info, call, "fmt", "Sprintln") || support.IsFunc(info, call, "strings", "Join")
}
