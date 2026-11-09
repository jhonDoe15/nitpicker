package modernize

import "reflect"

func TypeOfZero() reflect.Type {
	return reflect.TypeOf(0) // want reflecttypefor
}

func TypeOfInt() reflect.Type {
	return reflect.TypeFor[int]()
}
