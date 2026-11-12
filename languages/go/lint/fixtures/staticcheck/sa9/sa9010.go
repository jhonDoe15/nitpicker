package sa9

func cleanup() func() {
	return func() {}
}

func Missed() {
	defer cleanup() // want SA9010
}

func Called() {
	stop := cleanup()
	defer stop()
}
