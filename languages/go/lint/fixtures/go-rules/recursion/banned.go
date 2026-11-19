package recursion

type Node struct {
	Value    int
	Children []*Node
}

func Total(node *Node) int {
	total := node.Value
	for _, child := range node.Children {
		total += Total(child) // want self-recursion
	}
	return total
}

func IsEven(number int) bool {
	return number == 0 || IsOdd(number-1) // want self-recursion
}

func IsOdd(number int) bool {
	return number != 0 && IsEven(number-1)
}

type Walker struct{ seen int }

func (walker *Walker) Visit(node *Node) {
	walker.seen++
	walker.VisitChildren(node) // want self-recursion
}

func (walker *Walker) VisitChildren(node *Node) {
	for _, child := range node.Children {
		walker.Visit(child)
	}
}
