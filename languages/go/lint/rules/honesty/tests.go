package honesty

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const suitePackage = "github.com/stretchr/testify/suite"

var (
	failures         = []string{"Error", "Errorf", "Fatal", "Fatalf", "Fail", "FailNow"}
	skips            = []string{"Skip", "Skipf", "SkipNow"}
	expectations     = []string{"Expect", "ExpectWithOffset", "Ω", "Eventually", "EventuallyWithOffset", "Consistently"}
	assertionFolders = []string{"/assert", "/require"}
)

type testFile struct {
	file     *ast.File
	tests    []*ast.FuncDecl
	judged   map[*ast.FuncDecl]bool
	subtests map[*ast.FuncLit]bool
}

func testFiles(pass *analysis.Pass) []testFile {
	files := []testFile{}
	for _, file := range pass.Files {
		if !support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		found := testFile{file: file, judged: map[*ast.FuncDecl]bool{}, subtests: map[*ast.FuncLit]bool{}}
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok && function.Body != nil &&
				(isTest(pass.TypesInfo, function) || isSuiteTest(pass.TypesInfo, function)) {
				found.tests = append(found.tests, function)
			}
		}
		found.reach(pass.TypesInfo)
		files = append(files, found)
	}
	return files
}

func (found testFile) reach(info *types.Info) {
	declarations := map[types.Object]*ast.FuncDecl{}
	for _, declaration := range found.file.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok && function.Body != nil {
			declarations[info.Defs[function.Name]] = function
		}
	}
	pending := slices.Clone(found.tests)
	for len(pending) > 0 {
		function := pending[0]
		pending = pending[1:]
		if found.judged[function] {
			continue
		}
		found.judged[function] = true
		ast.Inspect(function.Body, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			if literal := subtestBody(info, call); literal != nil {
				found.subtests[literal] = true
			}
			if named := namedSubtest(info, call); named != nil && declarations[named] != nil {
				pending = append(pending, declarations[named])
			}
			if callee, isFunc := typeutil.Callee(info, call).(*types.Func); isFunc && declarations[callee.Origin()] != nil {
				pending = append(pending, declarations[callee.Origin()])
			}
			return true
		})
	}
}

func isTest(info *types.Info, function *ast.FuncDecl) bool {
	if function.Recv != nil || !testName(function.Name.Name) {
		return false
	}
	object, ok := info.Defs[function.Name].(*types.Func)
	if !ok {
		return false
	}
	signature := object.Signature()
	return signature.Results().Len() == 0 && signature.Params().Len() == 1 &&
		support.IsNamed(signature.Params().At(0).Type(), "testing", "T")
}

func isSuiteTest(info *types.Info, function *ast.FuncDecl) bool {
	if function.Recv == nil || !testName(function.Name.Name) {
		return false
	}
	object, ok := info.Defs[function.Name].(*types.Func)
	if !ok || object.Signature().Params().Len() != 0 {
		return false
	}
	return embedsSuite(object.Signature().Recv().Type())
}

func embedsSuite(typ types.Type) bool {
	found, _, _ := types.LookupFieldOrMethod(typ, true, nil, "SetT")
	method, ok := found.(*types.Func)
	return ok && method.Pkg() != nil && method.Pkg().Path() == suitePackage
}

func testName(name string) bool {
	rest, found := strings.CutPrefix(name, "Test")
	if !found {
		return false
	}
	first, _ := utf8.DecodeRuneInString(rest)
	return rest == "" || !unicode.IsLower(first)
}

func testingValue(info *types.Info, expression ast.Expr) bool {
	typ := info.TypeOf(expression)
	if typ == nil {
		return false
	}
	found, _, _ := types.LookupFieldOrMethod(typ, true, nil, "FailNow")
	method, ok := found.(*types.Func)
	return ok && method.Pkg() != nil && method.Pkg().Path() == "testing"
}

func testingMethod(info *types.Info, call *ast.CallExpr, names []string) bool {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	return ok && slices.Contains(names, selector.Sel.Name) && testingValue(info, selector.X)
}

func registersSubtest(info *types.Info, call *ast.CallExpr) bool {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Run" || len(call.Args) != 2 {
		return false
	}
	callee, _ := typeutil.Callee(info, call).(*types.Func)
	fromSuite := callee != nil && callee.Pkg() != nil && callee.Pkg().Path() == suitePackage
	return testingValue(info, selector.X) || fromSuite
}

func subtestBody(info *types.Info, call *ast.CallExpr) *ast.FuncLit {
	if !registersSubtest(info, call) {
		return nil
	}
	literal, _ := ast.Unparen(call.Args[1]).(*ast.FuncLit)
	return literal
}

func namedSubtest(info *types.Info, call *ast.CallExpr) types.Object {
	if !registersSubtest(info, call) {
		return nil
	}
	switch each := ast.Unparen(call.Args[1]).(type) {
	case *ast.Ident:
		return info.Uses[each]
	case *ast.SelectorExpr:
		return info.Uses[each.Sel]
	}
	return nil
}

func isAssertion(info *types.Info, call *ast.CallExpr) bool {
	if testingMethod(info, call, failures) {
		return true
	}
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return false
	}
	path := support.CalleePackage(callee)
	if strings.HasPrefix(path, "github.com/onsi/gomega") {
		return slices.Contains(expectations, callee.Name())
	}
	if !slices.ContainsFunc(assertionFolders, func(folder string) bool { return strings.HasSuffix(path, folder) }) {
		return false
	}
	signature := callee.Signature()
	if !reportsOnly(signature) {
		return false
	}
	if receiver := signature.Recv(); receiver != nil {
		return support.IsNamed(receiver.Type(), path, "Assertions")
	}
	return signature.Params().Len() > 0 && support.IsNamed(signature.Params().At(0).Type(), path, "TestingT")
}

func reportsOnly(signature *types.Signature) bool {
	results := signature.Results()
	if results.Len() == 0 {
		return true
	}
	basic, ok := results.At(0).Type().Underlying().(*types.Basic)
	return results.Len() == 1 && ok && basic.Kind() == types.Bool
}

func firstAssertion(info *types.Info, node ast.Node) ast.Node {
	var found ast.Node
	ast.Inspect(node, func(each ast.Node) bool {
		if call, ok := each.(*ast.CallExpr); ok && found == nil && isAssertion(info, call) {
			found = call
		}
		return found == nil
	})
	return found
}
