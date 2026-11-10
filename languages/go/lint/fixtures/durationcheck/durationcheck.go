package durationcheck

import "time"

func Wait(timeout time.Duration) time.Duration {
	return timeout * time.Second // want durationcheck
}

func WaitSeconds(seconds int) time.Duration {
	return time.Duration(seconds) * time.Second
}
