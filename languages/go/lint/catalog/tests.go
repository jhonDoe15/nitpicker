package catalog

import (
	testifylint "github.com/Antonboom/testifylint/analyzer"
	thelper "github.com/kulti/thelper/pkg/analyzer"
	"github.com/ldez/usetesting"
	"github.com/moricho/tparallel"
	"golang.org/x/tools/go/analysis"
)

// TestifyChecks are testifylint's checks, every one of them enabled.
var TestifyChecks = []string{
	"blank-import", "bool-compare", "compares", "contains", "empty", "encoded-compare",
	"equal-values", "error-is-as", "error-nil", "expected-actual", "float-compare", "formatter",
	"go-require", "len", "negative-positive", "nil-compare", "regexp", "require-error",
	"suite-broken-parallel", "suite-dont-use-pkg", "suite-extra-assert-call",
	"suite-method-signature", "suite-subtest-run", "suite-thelper", "useless-assert",
}

var (
	testify      = testifylint.New()
	testingForms = usetesting.NewAnalyzer()
	testLinters  = []Linter{
		{Tool: "thelper", Analyzers: []*analysis.Analyzer{thelper.NewAnalyzer()}},
		{Tool: "tparallel", Analyzers: []*analysis.Analyzer{tparallel.Analyzer}},
		{Tool: "testifylint", Analyzers: []*analysis.Analyzer{testify}, Checks: TestifyChecks},
		{Tool: "usetesting", Analyzers: []*analysis.Analyzer{testingForms}},
	}
)

func configureTests() error {
	for _, detection := range []string{"contextbackground", "contexttodo", "ossetenv"} {
		if err := testingForms.Flags.Set(detection, "true"); err != nil {
			return err
		}
	}
	return testify.Flags.Set("enable-all", "true")
}
