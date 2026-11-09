package gocritic

import (
	"slices"
	"sort"
	"strconv"
)

type Shape interface{ Area() float64 }

type Square struct{ side float64 }

func (square Square) Area() float64 { return square.side * square.side }

func Sized(shape Shape) float64 {
	return Shape.Area(shape) // want methodExprCall
}

func SizedOnce(shape Shape) float64 {
	return shape.Area()
}

func Zero() Square {
	return *new(Square) // want newDeref
}

func ZeroOnce() Square {
	return Square{}
}

const (
	Mask     = 0xFf // want hexLiteral
	Bits     = 0xff
	FileMode = 0644 // want octalLiteral
	DirMode  = 0o755
)

func Grow(values *map[string]int) { // want ptrToRefParam
	(*values)["grown"] = 1
}

func GrowOnce(values map[string]int) {
	values["grown"] = 1
}

func Describe(value any) string {
	if text, ok := value.(string); ok { // want typeAssertChain
		return text
	} else if number, ok := value.(int); ok {
		return strconv.Itoa(number)
	}
	return ""
}

func DescribeOnce(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int:
		return strconv.Itoa(typed)
	}
	return ""
}

func (later Later) Value() int { return later.value }

type Later struct{ value int } // want typeDefFirst

type Earlier struct{ value int }

func (earlier Earlier) Value() int { return earlier.value }

var Parsers = map[string](func(string) int){} // want typeUnparen

var Handlers = map[string]func(string) int{}

func Side(square *Square) float64 {
	return (*square).side // want underef
}

func SideOnce(square *Square) float64 {
	return square.side
}

func Apply(values []int, transform func(int) int) []int {
	mapped := make([]int, 0, len(values))
	for _, value := range values {
		mapped = append(mapped, transform(value))
	}
	return mapped
}

func Doubles(values []int) []int {
	return Apply(values, func(value int) int { return double(value) }) // want unlambda
}

func DoublesOnce(values []int) []int {
	return Apply(values, double)
}

func double(value int) int { return value * 2 }

func Ordered(names, others []string) {
	sort.Slice(names, func(i, j int) bool { return others[i] < others[j] }) // want sortSlice
	slices.Sort(names)
}

var () // want emptyDecl
