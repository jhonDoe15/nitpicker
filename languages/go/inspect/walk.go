package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type parsedFile struct {
	path   string
	syntax *ast.File
	source []byte
	test   bool
}

func skippedDirectory(entry fs.DirEntry) bool {
	name := entry.Name()
	if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
		return true
	}
	return name == "testdata" || name == "vendor" || name == "node_modules"
}

func isNestedModule(path string) bool {
	_, err := os.Stat(filepath.Join(path, "go.mod"))
	return err == nil
}

func goFiles(root string, report *Report) ([]string, error) {
	var files []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path == root {
				return nil
			}
			if skippedDirectory(entry) || isNestedModule(path) {
				relative, _ := filepath.Rel(root, path)
				report.Skipped = append(report.Skipped, filepath.ToSlash(relative))
				return filepath.SkipDir
			}
			return nil
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".go") && !strings.HasPrefix(name, ".") && !strings.HasPrefix(name, "_") {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)
	return files, err
}

func emptyReport() Report {
	return Report{
		Files: []File{}, Functions: []Function{}, Types: []Type{}, Tests: []Test{}, Branches: []Branch{}, Errors: []string{},
		Definitions: []Definition{}, Usages: []Usage{}, DocComments: []DocComment{}, Skipped: []string{},
	}
}

func parseFile(fileSet *token.FileSet, root, path string) (parsedFile, error) {
	source, err := os.ReadFile(path)
	if err != nil {
		return parsedFile{}, err
	}
	syntax, err := parser.ParseFile(fileSet, path, source, parser.ParseComments)
	relative, _ := filepath.Rel(root, path)
	relative = filepath.ToSlash(relative)
	return parsedFile{path: relative, syntax: syntax, source: source, test: strings.HasSuffix(relative, "_test.go")}, err
}

func inspectModule(root string) (Report, error) {
	report := emptyReport()
	paths, err := goFiles(root, &report)
	if err != nil {
		return report, err
	}
	fileSet := token.NewFileSet()
	var parsed []parsedFile
	for _, path := range paths {
		file, err := parseFile(fileSet, root, path)
		if file.syntax == nil {
			report.Errors = append(report.Errors, err.Error())
			continue
		}
		generated := ast.IsGenerated(file.syntax)
		report.Files = append(report.Files, File{
			Path: file.path, Package: file.syntax.Name.Name, Test: file.test, Generated: generated, Constrained: isConstrained(file),
		})
		if err != nil {
			report.Errors = append(report.Errors, err.Error())
		}
		report.Usages = append(report.Usages, fileUsage(fileSet, file))
		if generated {
			continue
		}
		parsed = append(parsed, file)
		if err == nil {
			report.Definitions = append(report.Definitions, fileDefinitions(fileSet, file)...)
		}
		if err == nil && !file.test {
			report.DocComments = append(report.DocComments, fileDocComments(fileSet, file)...)
		}
	}
	addFunctions(&report, fileSet, parsed)
	for _, function := range report.Functions {
		report.Branches = append(report.Branches, function.Branches...)
	}
	report.Types = typeEntries(fileSet, parsed)
	return report, nil
}
