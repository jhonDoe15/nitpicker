package modernize

import "reflect"

func TextOf(value reflect.Value) (string, bool) {
	text, ok := value.Interface().(string) // want reflecttypeassert
	return text, ok
}

func TextAsserted(value reflect.Value) (string, bool) {
	return reflect.TypeAssert[string](value)
}
