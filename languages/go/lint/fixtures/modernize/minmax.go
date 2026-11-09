package modernize

func Larger(left, right int) int {
	larger := left
	if right > left { // want minmax
		larger = right
	}
	return larger
}

func LargerBuiltin(left, right int) int {
	return max(left, right)
}
