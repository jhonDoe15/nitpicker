package passes

type Node struct {
	Next *Node
}

func Last(node *Node) *Node {
	if node == nil {
		return node.Next // want nilness
	}
	return node
}

func Tail(node *Node) *Node {
	if node == nil {
		return nil
	}
	return node.Next
}
