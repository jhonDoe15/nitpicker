package modernize

import "unsafe"

func Next(pointer unsafe.Pointer) unsafe.Pointer {
	return unsafe.Pointer(uintptr(pointer) + 1) // want unsafefuncs
}

func NextAdd(pointer unsafe.Pointer) unsafe.Pointer {
	return unsafe.Add(pointer, 1)
}
