package sa4

func Twice(ready bool) bool {
	return !!ready // want SA4013
}

func Once(ready bool) bool {
	return !ready
}
