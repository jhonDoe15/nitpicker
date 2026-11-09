package simple

func IsTrue(ready bool) bool {
	return ready == true // want S1002
}

func IsReady(ready bool) bool {
	return ready
}
