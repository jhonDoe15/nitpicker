package sa4

func AddressNil(count int) bool {
	return &count == nil // want SA4022
}

func PointerNil(count *int) bool {
	return count == nil
}
