package gocritic

import "strings"

func Cleared(values []int, start int) {
	for index := 0; index > start; index++ { // want badCond
		values[index] = 0
	}
	for index := range start {
		values[index] = 0
	}
}

func AtLeast(left, right int) bool {
	return left > right || left == right // want boolExprSimplify
}

func AtLeastOnce(left, right int) bool {
	return left >= right
}

func FirstIsTen(values []int) bool {
	return values != nil && values[0] == 10 // want weakCond
}

func FirstIsTenChecked(values []int) bool {
	return len(values) > 0 && values[0] == 10
}

func Narrowed(small int8, large int16) bool {
	return int8(large) < small // want truncateCmp
}

func Widened(small int8, large int16) bool {
	return large < int16(small)
}

type Node struct{ next *Node }

func Next(node *Node) *Node {
	if node == nil {
		return node // want nilValReturn
	}
	return node.next
}

func NextOnce(node *Node) *Node {
	if node == nil {
		return nil
	}
	return node.next
}

func Copied(target []byte) int {
	return copy(target, target) // want dupArg
}

func Same(left, right int) bool {
	return left*2 == left*2 && right > 0 // want SA4000
}

func Prefixed(name string) bool {
	return strings.HasPrefix("#", name) // want argOrder
}

func PrefixedRight(name string) bool {
	return strings.HasPrefix(name, "#")
}

func Never(values []int) bool {
	return len(values) <= 0 // want sloppyLen
}

func Empty(values []int) bool {
	return len(values) == 0
}
