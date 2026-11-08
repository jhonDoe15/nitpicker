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
	test   bool
}

func skippedDirectory(root, path string, entry fs.DirEntry) bool {
	if path == root {
		return false
	}
	name := entry.Name()
	if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
		return true
	}
	if name == "testdata" || name == "vendor" || name == "node_modules" {
		return true
	}
	_, err := os.Stat(filepath.Join(path, "go.mod"))
	return err == nil
}

func goFiles(root string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if skippedDirectory(root, path, entry) {
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

func inspectModule(root string) (Report, error) {
	report := Report{Files: []File{}, Functions: []Function{}, Types: []Type{}, Tests: []Function{}, Errors: []string{}}
	paths, err := goFiles(root)
	if err != nil {
		return report, err
	}
	fileSet := token.NewFileSet()
	var parsed []parsedFile
	for _, path := range paths {
		syntax, err := parser.ParseFile(fileSet, path, nil, parser.ParseComments|parser.SkipObjectResolution)
		if syntax == nil {
			report.Errors = append(report.Errors, err.Error())
			continue
		}
		relative, _ := filepath.Rel(root, path)
		relative = filepath.ToSlash(relative)
		test := strings.HasSuffix(relative, "_test.go")
		generated := ast.IsGenerated(syntax)
		report.Files = append(report.Files, File{Path: relative, Package: syntax.Name.Name, Test: test, Generated: generated})
		if err != nil {
			report.Errors = append(report.Errors, err.Error())
		}
		if !generated {
			parsed = append(parsed, parsedFile{path: relative, syntax: syntax, test: test})
		}
	}
	addFunctions(&report, fileSet, parsed)
	report.Types = typeEntries(fileSet, parsed)
	return report, nil
}
