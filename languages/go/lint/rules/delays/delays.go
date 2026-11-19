package delays

import (
	"fmt"
	"go/ast"
	"go/constant"
	"go/types"
	"regexp"
	"time"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "uninjectable_delay",
	Doc:      "reports an exported function that waits a package constant it cannot override",
	Requires: support.Requires,
	Run:      run,
}

const message = "%s waits %s (%d ms), a package constant that exported \"%s\" cannot override, so a test must " +
	"wait it out or fake the clock. Accept the delay as a parameter, or a field or option of the type, with %s as " +
	"its default. An exception fits only when the delay is deliberately fixed."

const minDelay = 500 * time.Millisecond

var carrierName = regexp.MustCompile(`(?i)option|opts|config|setting|delay|timeout|interval|wait|duration` +
	`|param|override|dependenc|deps|clock|sleeper`)

var optionTypeName = regexp.MustCompile(`(?i)options?$|config$|settings?$`)

var timers = []string{"Sleep", "After"}

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		timer := timerOf(pass, call)
		if timer == "" || len(call.Args) != 1 || support.InTestFile(pass, call) {
			continue
		}
		name, delay := constantDelay(pass, call.Args[0])
		if name == "" || delay < minDelay {
			continue
		}
		declaration, found := support.EnclosingDecl(cursor)
		if !found || !exported(pass, declaration) || canCarryDelay(pass, declaration) {
			continue
		}
		pass.Reportf(call.Pos(), message, "time."+timer, name, delay.Milliseconds(), owner(declaration), name)
	}
	return nil, nil
}

func timerOf(pass *analysis.Pass, call *ast.CallExpr) string {
	for _, timer := range timers {
		if support.IsFunc(pass.TypesInfo, call, "time", timer) {
			return timer
		}
	}
	return ""
}

func constantDelay(pass *analysis.Pass, argument ast.Expr) (string, time.Duration) {
	value := pass.TypesInfo.Types[argument].Value
	if value == nil || value.Kind() != constant.Int {
		return "", 0
	}
	nanoseconds, exact := constant.Int64Val(value)
	if !exact {
		return "", 0
	}
	name := ""
	ast.Inspect(argument, func(node ast.Node) bool {
		identifier, ok := node.(*ast.Ident)
		if !ok || name != "" {
			return name == ""
		}
		if object, isConst := pass.TypesInfo.Uses[identifier].(*types.Const); isConst && object.Parent() == pass.Pkg.Scope() {
			name = identifier.Name
		}
		return true
	})
	return name, time.Duration(nanoseconds)
}

func exported(pass *analysis.Pass, declaration *ast.FuncDecl) bool {
	if !declaration.Name.IsExported() {
		return false
	}
	receiver := receiverType(pass, declaration)
	return receiver == nil || receiver.Obj().Exported()
}

func receiverType(pass *analysis.Pass, declaration *ast.FuncDecl) *types.Named {
	if declaration.Recv == nil || len(declaration.Recv.List) == 0 {
		return nil
	}
	named, _ := types.Unalias(support.Deref(pass.TypesInfo.TypeOf(declaration.Recv.List[0].Type))).(*types.Named)
	return named
}

func owner(declaration *ast.FuncDecl) string {
	if declaration.Recv == nil || len(declaration.Recv.List) == 0 {
		return declaration.Name.Name
	}
	return fmt.Sprintf("%s.%s", types.ExprString(declaration.Recv.List[0].Type), declaration.Name.Name)
}

func canCarryDelay(pass *analysis.Pass, declaration *ast.FuncDecl) bool {
	for _, field := range declaration.Type.Params.List {
		if carries(pass.TypesInfo.TypeOf(field.Type), field.Names) {
			return true
		}
	}
	if named := receiverType(pass, declaration); named != nil {
		if structure, ok := named.Underlying().(*types.Struct); ok {
			for field := range structure.Fields() {
				if carries(field.Type(), []*ast.Ident{ast.NewIdent(field.Name())}) {
					return true
				}
			}
		}
	}
	return false
}

func carries(typ types.Type, names []*ast.Ident) bool {
	for _, name := range names {
		if carrierName.MatchString(name.Name) {
			return true
		}
	}
	if support.IsNamed(typ, "time", "Duration") {
		return true
	}
	if slice, ok := types.Unalias(typ).(*types.Slice); ok {
		typ = slice.Elem()
	}
	named, ok := types.Unalias(support.Deref(typ)).(*types.Named)
	return ok && optionTypeName.MatchString(named.Obj().Name())
}
