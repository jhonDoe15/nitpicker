package g1

import "unsafe"

func Address(value *int) uintptr {
	return uintptr(unsafe.Pointer(value)) // want G103
}

func Same(left, right *int) bool {
	return left == right
}
