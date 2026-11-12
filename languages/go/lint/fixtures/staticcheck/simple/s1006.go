package simple

func LoopTrue(next func() bool) {
	for true { // want S1006
		if !next() {
			return
		}
	}
}

func LoopForever(next func() bool) {
	for {
		if !next() {
			return
		}
	}
}
