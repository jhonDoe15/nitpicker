package sa1

import "time"

func NapTiny() {
	time.Sleep(1) // want SA1004
}

func NapSecond() {
	time.Sleep(time.Second)
}
