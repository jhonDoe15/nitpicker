package sa4

type Problem struct{}

func (*Problem) Error() string {
	return "problem"
}

func find(missing bool) *Problem {
	if missing {
		return &Problem{}
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
		return &Problem{}
	}
	return nil
}
