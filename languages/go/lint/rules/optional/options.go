package optional

import (
	"go/token"
	"go/types"
	"reflect"
	"strconv"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:       "unused_option",
	Doc:        "collects the options of exported functions and the places that set them",
	Requires:   support.Requires,
	Run:        run,
	ResultType: reflect.TypeFor[*Result](),
}

type Option struct {
	Name      string
	Position  token.Position
	Published bool
}

type Result struct {
	Declared map[string]Option
	Set      map[string]bool
	SetTests map[string]bool
}

func run(pass *analysis.Pass) (any, error) {
	result := &Result{Declared: map[string]Option{}, Set: map[string]bool{}, SetTests: map[string]bool{}}
	declare(pass, result)
	collectSets(pass, result)
	return result, nil
}

func key(pass *analysis.Pass, object types.Object) string {
	position := pass.Fset.Position(object.Pos())
	return position.Filename + ":" + strconv.Itoa(position.Offset)
}

func published(pass *analysis.Pass, pkg *types.Package) bool {
	if pass.Module == nil || pkg.Name() == "main" {
		return false
	}
	first, _, _ := strings.Cut(pass.Module.Path, "/")
	return strings.Contains(first, ".") && !strings.Contains("/"+pkg.Path()+"/", "/internal/")
}

func isOptionsStruct(named *types.Named) bool {
	name := named.Obj().Name()
	_, isStruct := named.Underlying().(*types.Struct)
	return isStruct && (strings.HasSuffix(name, "Options") || strings.HasSuffix(name, "Opts"))
}

func optionsStruct(typ types.Type) (*types.Named, bool) {
	named, ok := types.Unalias(support.Deref(typ)).(*types.Named)
	return named, ok && isOptionsStruct(named)
}

func isOptionFunc(object types.Object) bool {
	function, ok := object.(*types.Func)
	return ok && function.Exported() && strings.HasPrefix(function.Name(), "With") &&
		function.Type().(*types.Signature).Recv() == nil
}

func UnusedOptions(results []*Result) []Option {
	declared := map[string]Option{}
	set := map[string]bool{}
	tests := map[string]bool{}
	for _, result := range results {
		for key, option := range result.Declared {
			declared[key] = option
		}
		for key := range result.Set {
			set[key] = true
		}
		for key := range result.SetTests {
			tests[key] = true
		}
	}
	var unused []Option
	for key, option := range declared {
		if !set[key] && !(option.Published && tests[key]) {
			unused = append(unused, option)
		}
	}
	return unused
}
