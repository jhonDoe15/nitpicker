package sa4

type ProblemError struct{}

func (*ProblemError) Error() string {
	return "problem"
}

func find(missing bool) *ProblemError {
	if missing {
		return &ProblemError{}
	}
	return nil
}

func Typed(missing bool) error {
	return find(missing)
}

func TypedNil(missing bool) bool {
	return Typed(missing) == nil // want SA4023
}

func Untyped(missing bool) error {
	if missing {
		return &ProblemError{}
	}
	return nil
}
