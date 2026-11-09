package sa5

func Poll(events chan int) int {
	for {
		select {
		case event := <-events:
			return event
		default: // want SA5004
		}
	}
}

func Wait(events chan int) int {
	return <-events
}
