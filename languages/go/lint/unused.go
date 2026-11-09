package main

import (
	"iter"
	"strconv"

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
