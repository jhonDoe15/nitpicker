package errname

type Missing struct{} // want errname

func (*Missing) Error() string {
	return "missing"
}

type MissingError struct{}

func (*MissingError) Error() string {
	return "missing"
}
