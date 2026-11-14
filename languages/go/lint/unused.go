package main

import (
	"encoding/json"
	"iter"
	"strconv"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/optional"
	"honnef.co/go/tools/unused"
)

type unusedObjects struct {
	unused map[string]Finding
	used   map[string]bool
}

func objectKey(object unused.Object) string {
	return object.Position.Filename + ":" + strconv.Itoa(object.Position.Offset)
}

func (objects unusedObjects) add(result any) {
	report, ok := result.(unused.Result)
	if !ok {
		return
	}
	for _, object := range report.Used {
		objects.used[objectKey(object)] = true
	}
	for _, object := range report.Unused {
		place := object.DisplayPosition
		objects.unused[objectKey(object)] = Finding{
			Tool: staticcheckTool, Rule: unused.Analyzer.Analyzer.Name,
			File: place.Filename, Line: place.Line, Column: place.Column,
			Message: object.Kind + " " + object.Name + " is unused",
		}
	}
}

func (objects unusedObjects) findings() iter.Seq[Finding] {
	return func(yield func(Finding) bool) {
		for key, found := range objects.unused {
			if !objects.used[key] && !yield(found) {
				return
			}
		}
	}
}

type optionResults []*optional.Result

func (results *optionResults) add(result any) {
	if found, ok := result.(*optional.Result); ok {
		*results = append(*results, found)
	}
}

type unusedOption struct {
	Name      string `json:"name"`
	Published bool   `json:"published"`
}

func (results optionResults) findings() []Finding {
	var found []Finding
	for _, option := range optional.UnusedOptions(results) {
		message, _ := json.Marshal(unusedOption{Name: option.Name, Published: option.Published})
		found = append(found, Finding{
			Tool: rules.Tool, Rule: ruleName(optional.Analyzer),
			File: option.Position.Filename, Line: option.Position.Line, Column: option.Position.Column,
			Message: string(message),
		})
	}
	return found
}
