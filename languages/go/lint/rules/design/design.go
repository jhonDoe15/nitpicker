package design

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{
		stateAnalyzer, initAnalyzer, interfaceAnalyzer, anyAnalyzer, packageNameAnalyzer, getterAnalyzer,
	}
}
