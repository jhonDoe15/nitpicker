package simple

func ReceiveSelect(values chan int) int {
	select { // want S1000
	case value := <-values:
		return value
	}
}

func Receive(values chan int) int {
	return <-values
}
