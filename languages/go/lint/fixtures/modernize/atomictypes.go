package modernize

import "sync/atomic"

type Hits struct {
	count int64 // want atomictypes
}

func (hits *Hits) Add() int64 {
	return atomic.AddInt64(&hits.count, 1)
}

type Visits struct {
	count atomic.Int64
}

func (visits *Visits) Add() int64 {
	return visits.count.Add(1)
}
