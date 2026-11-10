package main

import (
	"go/ast"
	"path"
	"strings"
)

var knownOS = toSet("aix android darwin dragonfly freebsd hurd illumos ios js linux nacl netbsd openbsd plan9 solaris wasip1 windows zos")
var knownArch = toSet("386 amd64 amd64p32 arm armbe arm64 arm64be loong64 mips mipsle mips64 mips64le mips64p32 mips64p32le ppc ppc64 ppc64le riscv riscv64 s390 s390x sparc sparc64 wasm")

func toSet(words string) map[string]bool {
	set := map[string]bool{}
	for _, word := range strings.Fields(words) {
		set[word] = true
	}
	return set
}

func hasConstraintComment(syntax *ast.File) bool {
	for _, group := range syntax.Comments {
		if group.Pos() >= syntax.Package {
			return false
		}
		for _, comment := range group.List {
			if strings.HasPrefix(comment.Text, "//go:build") || strings.HasPrefix(comment.Text, "// +build") {
				return true
			}
		}
	}
	return false
}

func hasPlatformSuffix(file string) bool {
	stem := strings.TrimSuffix(strings.TrimSuffix(path.Base(file), ".go"), "_test")
	parts := strings.Split(stem, "_")
	if len(parts) < 2 {
		return false
	}
	last := parts[len(parts)-1]
	return knownOS[last] || knownArch[last]
}

func isConstrained(file parsedFile) bool {
	return hasConstraintComment(file.syntax) || hasPlatformSuffix(file.path)
}
