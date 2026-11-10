package sa4

type Problem struct{}

func (*Problem) Error() string {
	return "problem"
}

func find(code int) *Problem {
	if code != 0 {
		return &Problem{}
	}
	return nil
}

func Typed(code int) error {
	return find(code)
}

func TypedNil(code int) bool {
	return Typed(code) == nil // want SA4023
}

func Untyped(code int) error {
	if code != 0 {
		return &Problem{}
	}
	return nil
}
