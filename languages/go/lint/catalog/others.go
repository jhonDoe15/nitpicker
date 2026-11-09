package catalog

import (
	"4d63.com/gocheckcompilerdirectives/checkcompilerdirectives"
	"github.com/breml/bidichk/pkg/bidichk"
	perfsprint "github.com/catenacyber/perfsprint/analyzer"
	"github.com/golangci/asciicheck"
	"github.com/golangci/canonicalheader"
	spancheck "github.com/jjti/go-spancheck"
	usestdlibvars "github.com/sashamelentyev/usestdlibvars/pkg/analyzer"
	"go-simpler.org/musttag"
	"go-simpler.org/sloglint"
	"golang.org/x/tools/go/analysis"
)

// PerfsprintChecks are the perfsprint checks this preset runs; modernize covers concat-loop.
var PerfsprintChecks = []string{
	"error-format", "integer-format", "string-format", "bool-format", "hex-format",
}

var standardValues = []string{
	usestdlibvars.TimeWeekdayFlag, usestdlibvars.TimeMonthFlag, usestdlibvars.TimeLayoutFlag,
	usestdlibvars.CryptoHashFlag, usestdlibvars.RPCDefaultPathFlag, usestdlibvars.SQLIsolationLevelFlag,
	usestdlibvars.TLSSignatureSchemeFlag, usestdlibvars.ConstantKindFlag, usestdlibvars.TimeDateMonthFlag,
}

var (
	spans        = spancheck.NewAnalyzerWithConfig(spancheck.NewDefaultConfig())
	formatting   = perfsprint.New()
	stdlibValues = usestdlibvars.New()
	logCalls     = sloglint.New(&sloglint.Options{
		ContextOnly: "scope", StaticMessage: true, AttributesOnly: true,
	})
	otherLinters = []Linter{
		{Tool: "asciicheck", Analyzers: []*analysis.Analyzer{asciicheck.NewAnalyzer()}},
		{Tool: "bidichk", Analyzers: []*analysis.Analyzer{bidichk.NewAnalyzer()}},
		{Tool: "gocheckcompilerdirectives", Analyzers: []*analysis.Analyzer{checkcompilerdirectives.Analyzer()}},
		{Tool: "canonicalheader", Analyzers: []*analysis.Analyzer{canonicalheader.New()}},
		{Tool: "musttag", Analyzers: []*analysis.Analyzer{musttag.New()}},
		{Tool: "perfsprint", Analyzers: []*analysis.Analyzer{formatting}, Checks: PerfsprintChecks},
		{Tool: "usestdlibvars", Analyzers: []*analysis.Analyzer{stdlibValues}},
		{Tool: "sloglint", Analyzers: []*analysis.Analyzer{logCalls}},
		{Tool: "spancheck", Analyzers: []*analysis.Analyzer{spans}},
	}
)

func configureOthers() error {
	for _, check := range standardValues {
		if err := stdlibValues.Flags.Set(check, "true"); err != nil {
			return err
		}
	}
	for _, check := range []string{"fiximports", "concat-loop"} {
		if err := formatting.Flags.Set(check, "false"); err != nil {
			return err
		}
	}
	return nil
}
