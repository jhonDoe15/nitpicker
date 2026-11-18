package backoff

import "time"

func Delay(base time.Duration, attempt int) time.Duration {
	return base * (1 << attempt) // want backoff-shift-overflow
}

func DelayClamped(base, limit time.Duration, retries uint) time.Duration {
	return min(base*(1<<min(retries, 62)), limit) // want backoff-shift-overflow
}

func DelaySmallCap(base time.Duration, attempt uint) time.Duration {
	return base * (1 << min(attempt, 20))
}

func DelayLimited(base, limit time.Duration, attempt int) time.Duration {
	if attempt >= 20 {
		return limit
	}
	return base * (1 << attempt)
}

func Width(unit, bits int) int {
	return unit * (1 << bits)
}

func Fixed(base time.Duration) time.Duration {
	return base * (1 << 4)
}
