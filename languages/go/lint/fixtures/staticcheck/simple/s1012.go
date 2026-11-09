package simple

import "time"

func ElapsedSub(start time.Time) time.Duration {
	return time.Now().Sub(start) // want S1012
}

func Elapsed(start time.Time) time.Duration {
	return time.Since(start)
}
