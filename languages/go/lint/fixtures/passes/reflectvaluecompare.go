package passes

import "reflect"

func SameValue(left, right reflect.Value) bool {
	return left == right // want reflectvaluecompare
}

func EqualValue(left, right reflect.Value) bool {
	return left.Equal(right)
}
