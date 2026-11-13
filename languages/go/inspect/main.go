package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/mutants"
)

type mutantTargets struct {
	All   bool                `json:"all"`
	Files map[string][][2]int `json:"files"`
}

func main() {
	var err error
	switch {
	case len(os.Args) == 3:
		var report Report
		report, err = inspectModule(os.Args[1])
		if err == nil {
			err = writeReport(os.Args[2], report)
		}
	case len(os.Args) == 5 && os.Args[1] == "mutants":
		err = writeMutants(os.Args[2], os.Args[3], os.Args[4])
	default:
		fmt.Fprintln(os.Stderr, "usage: inspect <module root> <report file> | inspect mutants <module root> <targets file> <mutants file>")
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func writeReport(path string, report any) error {
	data, err := json.Marshal(report)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func readTargets(path string) (mutantTargets, error) {
	var targets mutantTargets
	data, err := os.ReadFile(path)
	if err == nil {
		err = json.Unmarshal(data, &targets)
	}
	return targets, err
}

func lineFilter(targets mutantTargets, file string) func(int) bool {
	ranges := targets.Files[file]
	return func(line int) bool {
		if targets.All {
			return true
		}
		for _, span := range ranges {
			if span[0] <= line && line <= span[1] {
				return true
			}
		}
		return false
	}
}

func targetFiles(root string, targets mutantTargets) ([]string, error) {
	if !targets.All {
		files := make([]string, 0, len(targets.Files))
		for file := range targets.Files {
			files = append(files, file)
		}
		sort.Strings(files)
		return files, nil
	}
	paths, err := goFiles(root, &Report{})
	files := make([]string, 0, len(paths))
	for _, path := range paths {
		relative, _ := filepath.Rel(root, path)
		files = append(files, filepath.ToSlash(relative))
	}
	return files, err
}

func writeMutants(root, targetsPath, outPath string) error {
	targets, err := readTargets(targetsPath)
	if err != nil {
		return err
	}
	files, err := targetFiles(root, targets)
	if err != nil {
		return err
	}
	found := []mutants.Mutant{}
	fileSet := token.NewFileSet()
	for _, file := range files {
		source, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(file)))
		if err != nil {
			continue
		}
		syntax, err := parser.ParseFile(fileSet, file, source, parser.ParseComments|parser.SkipObjectResolution)
		if err != nil || ast.IsGenerated(syntax) || isTestFile(file) {
			continue
		}
		found = append(found, mutants.Generate(fileSet, file, syntax, source, lineFilter(targets, file), functionName)...)
	}
	return writeReport(outPath, found)
}

func isTestFile(file string) bool {
	return filepath.Ext(file) == ".go" && len(file) > len("_test.go") && file[len(file)-len("_test.go"):] == "_test.go"
}
