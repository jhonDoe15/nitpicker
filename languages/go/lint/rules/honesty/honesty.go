package honesty

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{
		unassertedAnalyzer, conditionalAnalyzer, reasonAnalyzer, switchedOffAnalyzer, sleepAnalyzer,
	}
}
