package sa1

import "sync/atomic"

type Stats struct {
	Flag  int32
	Count int64
}

func Bump(stats *Stats) int64 {
	return atomic.AddInt64(&stats.Count, 1) // want SA1027
}

type AlignedStats struct {
	Count atomic.Int64
	Flag  int32
}

func BumpAligned(stats *AlignedStats) int64 {
	return stats.Count.Add(1)
}
