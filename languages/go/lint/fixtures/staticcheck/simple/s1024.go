package simple

import "time"

func LeftSub(deadline time.Time) time.Duration {
	return deadline.Sub(time.Now()) // want S1024
}

func Left(deadline time.Time) time.Duration {
	return time.Until(deadline)
}
