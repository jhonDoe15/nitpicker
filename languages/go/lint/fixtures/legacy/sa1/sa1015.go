package sa1

import "time"

func Leaky(limit int) {
	for range time.Tick(time.Second) { // want SA1015
		limit--
		if limit == 0 {
			return
		}
	}
}

func Stopped(limit int) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		limit--
		if limit == 0 {
			return
		}
	}
}
