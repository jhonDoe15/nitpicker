package sa4

type Point struct {
	X int
}

func Copied(point *Point) *Point {
	return &*point // want SA4001
}

func CopiedValue(point *Point) *Point {
	copied := *point
	return &copied
}
