package gocritic

import "sync"

type Counter struct { // want exposedSyncMutex
	sync.Mutex
	count int
}

type Guarded struct {
	mu    sync.RWMutex
	count int
}

func (guarded *Guarded) Read() int {
	guarded.mu.Lock()
	defer guarded.mu.RUnlock() // want badLock
	return guarded.count
}

func (guarded *Guarded) Count() int {
	guarded.mu.RLock()
	defer guarded.mu.RUnlock()
	return guarded.count
}

func (counter *Counter) Increment() {
	counter.Lock()
	defer counter.Unlock()
	counter.count++
}

func Once(work func()) {
	sync.OnceFunc(work)() // want badSyncOnceFunc
}

func Prepared(work func()) func() {
	return sync.OnceFunc(work)
}

func Take(cache *sync.Map, key string) any { // want any-in-exported-signature
	value, ok := cache.Load(key) // want syncMapLoadAndDelete
	if ok {
		cache.Delete(key)
	}
	return value
}

func TakeOnce(cache *sync.Map, key string) any { // want any-in-exported-signature
	value, _ := cache.LoadAndDelete(key)
	return value
}
