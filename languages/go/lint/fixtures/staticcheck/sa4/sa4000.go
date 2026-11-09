package sa4

func SameSides(left int) bool {
	return left == left // want SA4000
}

func BothSides(left, right int) bool {
	return left == right
}
