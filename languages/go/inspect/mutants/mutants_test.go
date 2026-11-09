package mutants

import (
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"testing"
)

const sample = `package demo

import "strings"

type Item struct {
	Name string ` + "`json:\"name\"`" + `
}

func (i *Item) Score(values []int, on bool) int {
	total := 0
	for index := 0; index < len(values); index++ {
		total += values[index] * 2
		if !on && total > 10 {
			break
		}
	}
	switch total {
	case 1:
		total--
	}
	println(strings.ToUpper("hi"))
	return -total
}

var greeting = "hello"
`

type found struct {
	Function, Operator, Original, Replacement string
	Line                                      int
}

func generate(t *testing.T, wanted func(int) bool) []found {
	t.Helper()
	fileSet := token.NewFileSet()
	file, err := parser.ParseFile(fileSet, "demo.go", sample, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	name := func(function *ast.FuncDecl) string { return "Item." + function.Name.Name }
	results := []found{}
	for _, mutant := range Generate(fileSet, "demo.go", file, []byte(sample), wanted, name) {
		if sample[mutant.Start:mutant.End] != mutant.Original {
			t.Fatalf("offsets %d-%d do not hold %q", mutant.Start, mutant.End, mutant.Original)
		}
		results = append(results, found{mutant.Function, mutant.Operator, mutant.Original, mutant.Replacement, mutant.Line})
	}
	return results
}

func TestGeneratesEachOperatorWithItsFunction(t *testing.T) {
	got := generate(t, func(int) bool { return true })
	want := []found{
		{"Item.Score", "ConditionalExpression", "index < len(values)", "false", 11},
		{"Item.Score", "EqualityOperator", "<", "<=", 11},
		{"Item.Score", "EqualityOperator", "<", ">=", 11},
		{"Item.Score", "UpdateOperator", "++", "--", 11},
		{"Item.Score", "AssignmentOperator", "+=", "-=", 12},
		{"Item.Score", "ArithmeticOperator", "*", "/", 12},
		{"Item.Score", "ConditionalExpression", "!on && total > 10", "true", 13},
		{"Item.Score", "ConditionalExpression", "!on && total > 10", "false", 13},
		{"Item.Score", "LogicalOperator", "&&", "||", 13},
		{"Item.Score", "UnaryOperator", "!", "", 13},
		{"Item.Score", "EqualityOperator", ">", ">=", 13},
		{"Item.Score", "EqualityOperator", ">", "<=", 13},
		{"Item.Score", "LoopControl", "break", "continue", 14},
		{"Item.Score", "SwitchCase", "\n\t\ttotal--", "", 18},
		{"Item.Score", "UpdateOperator", "--", "++", 19},
		{"Item.Score", "RemovedCall", "println(strings.ToUpper(\"hi\"))", "", 21},
		{"Item.Score", "StringLiteral", "\"hi\"", "\"\"", 21},
		{"Item.Score", "UnaryOperator", "-", "", 22},
		{"", "StringLiteral", "\"hello\"", "\"\"", 25},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v\nwant %#v", got, want)
	}
}

func TestGeneratesOnlyOnWantedLines(t *testing.T) {
	got := generate(t, func(line int) bool { return line == 14 })
	want := []found{{"Item.Score", "LoopControl", "break", "continue", 14}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v\nwant %#v", got, want)
	}
}
