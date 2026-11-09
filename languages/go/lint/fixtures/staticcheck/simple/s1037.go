package simple

import "time"

func Pause(delay time.Duration) {
	select { // want S1037
	case <-time.After(delay):
	}
}

func Sleep(delay time.Duration) {
	time.Sleep(delay)
}
