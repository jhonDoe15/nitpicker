package sa4

type ProblemError struct{}

func (*ProblemError) Error() string {
	return "problem"
}

func find(code int) *ProblemError {
	if code != 0 {
		return &ProblemError{}
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
		return &ProblemError{}
	}
	return nil
}
