package sa5

func Spin() {
	for { // want SA5002
	}
}

func Block(done chan struct{}) {
	<-done
}
