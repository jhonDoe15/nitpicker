package failures

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{panicAnalyzer, loggedAnalyzer}
}
