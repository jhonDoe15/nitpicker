package sa1

import "time"

func ResetDrained(timer *time.Timer) {
	if !timer.Reset(time.Second) { // want SA1025
		<-timer.C
	}
}

func ResetStopped(timer *time.Timer) {
	if !timer.Stop() {
		<-timer.C
	}
	timer.Reset(time.Second)
}
