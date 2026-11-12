package guards

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var literalAnalyzer = &analysis.Analyzer{
	Name:     "repeated_string_literal",
	Doc:      "reports a string literal used more than twice in a file",
	Requires: support.Requires,
	Run:      runLiterals,
}

const (
	literalMessage = "the string %s is written %d times in this file: declare it once as a constant " +
		"(a typed constant when it is one of a set of values) and use the name"
	minimumLength = 5
	maximumUses   = 2
)

var (
	alphanumeric = regexp.MustCompile(`[A-Za-z0-9]`)
	mimeType     = regexp.MustCompile(`^(?:application|audio|font|image|message|model|multipart|text|video)/` +
		`[a-z0-9.+*-]+$`)
	goLayout = regexp.MustCompile(`^(?:2006|January|Jan|Monday|Mon|MST|Z07:00|Z0700|-07:00|-0700|` +
		`\.0+|\.9+|01|02|03|04|05|06|15|PM|pm|_2|[-:/ T.,])+$`)
	idiomaticText = []string{
		"utf-8", "utf8", "ascii", "latin-1", "utf-16", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
	}
	formatVerb       = regexp.MustCompile(`%[-+#0-9.*\[\]]*[a-zA-Z]`)
	translationCalls = []string{"T", "Tr", "Translate", "Gettext", "NGettext", "Localize", "MustLocalize"}
	discriminantKeys = []string{"type", "kind", "tag", "variant"}
)

func runLiterals(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		reportRepeats(pass, fileUses(pass, file))
	}
	return nil, nil
}

func fileUses(pass *analysis.Pass, file *ast.File) map[string][]*ast.BasicLit {
	uses := map[string][]*ast.BasicLit{}
	root, found := support.Root(pass).FindNode(file)
	if !found {
		return uses
	}
	for cursor := range root.Preorder((*ast.BasicLit)(nil)) {
		literal := cursor.Node().(*ast.BasicLit)
		if literal.Kind != token.STRING {
			continue
		}
		value, err := strconv.Unquote(literal.Value)
		if err == nil && countable(value) && !skippedPlace(pass.TypesInfo, cursor) {
			uses[value] = append(uses[value], literal)
		}
	}
	return uses
}

func reportRepeats(pass *analysis.Pass, uses map[string][]*ast.BasicLit) {
	for value, literals := range uses {
		if len(literals) <= maximumUses {
			continue
		}
		slices.SortFunc(literals, func(left, right *ast.BasicLit) int { return int(left.Pos() - right.Pos()) })
		for _, literal := range literals[maximumUses:] {
			pass.Reportf(literal.Pos(), literalMessage, strconv.Quote(value), len(literals))
		}
	}
}

func countable(value string) bool {
	if utf8.RuneCountInString(value) < minimumLength || !alphanumeric.MatchString(value) {
		return false
	}
	if slices.Contains(idiomaticText, value) || mimeType.MatchString(value) || goLayout.MatchString(value) {
		return false
	}
	return !formatVerb.MatchString(value)
}

func skippedPlace(info *types.Info, cursor inspector.Cursor) bool {
	literal := cursor.Node()
	switch parent := cursor.Parent().Node().(type) {
	case *ast.ImportSpec, *ast.Field, *ast.CaseClause, *ast.IndexExpr, *ast.IndexListExpr:
		return true
	case *ast.KeyValueExpr:
		return parent.Key == literal || discriminant(parent.Key)
	case *ast.CallExpr:
		return firstArgument(parent, literal) && translation(parent.Fun) || logKey(info, parent, literal)
	}
	return inConstant(cursor)
}

func firstArgument(call *ast.CallExpr, literal ast.Node) bool {
	return len(call.Args) > 0 && call.Args[0] == literal
}

func logKey(info *types.Info, call *ast.CallExpr, literal ast.Node) bool {
	callee, isLogger := support.LoggerCall(info, call)
	if !isLogger {
		return false
	}
	signature := callee.Signature()
	if firstArgument(call, literal) {
		return signature.Results().Len() > 0
	}
	if !signature.Variadic() {
		return false
	}
	first := signature.Params().Len() - 1
	position := slices.Index(call.Args, literal.(ast.Expr))
	return position >= first && (position-first)%2 == 0
}

func discriminant(key ast.Expr) bool {
	switch each := key.(type) {
	case *ast.Ident:
		return slices.Contains(discriminantKeys, strings.ToLower(each.Name))
	case *ast.BasicLit:
		value, err := strconv.Unquote(each.Value)
		return err == nil && slices.Contains(discriminantKeys, value)
	}
	return false
}

func translation(function ast.Expr) bool {
	switch each := ast.Unparen(function).(type) {
	case *ast.Ident:
		return slices.Contains(translationCalls, each.Name)
	case *ast.SelectorExpr:
		return slices.Contains(translationCalls, each.Sel.Name)
	}
	return false
}

func inConstant(cursor inspector.Cursor) bool {
	for each := range cursor.Enclosing((*ast.GenDecl)(nil), (*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		declaration, ok := each.Node().(*ast.GenDecl)
		return ok && declaration.Tok == token.CONST
	}
	return false
}
