package design

import (
	"errors"
	"sync"
	"sync/atomic"
)

var ErrMissing = errors.New("missing")

var limits = map[string]int{"orders": 10}

var cache = map[string]string{} // want mutable-package-state

var hits int // want mutable-package-state

var lock sync.Mutex

var buffers = sync.Pool{New: func() any { return new([]byte) }}

var settings = sync.OnceValue(func() map[string]string { return map[string]string{"mode": "fast"} })

func Remember(key, value string) {
	lock.Lock()
	defer lock.Unlock()
	cache[key] = value
	hits++
}

func Limit(name string) (int, error) {
	limit, found := limits[name]
	if !found {
		return 0, ErrMissing
	}
	return limit, nil
}

func Hits() int {
	lock.Lock()
	defer lock.Unlock()
	return hits
}

func Mode() string {
	return settings()["mode"]
}

func Borrow() any { // want any-in-exported-signature
	return buffers.Get()
}

type Store struct {
	mutex   sync.Mutex
	entries map[string]string
}

func (store *Store) Remember(key, value string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	store.entries[key] = value
}

func (store *Store) Forget(key string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	delete(store.entries, key)
}

var loaded map[string]string // want mutable-package-state

var once sync.Once // want mutable-package-state

var total int // want mutable-package-state

var seen = map[string]bool{} // want mutable-package-state

var config struct{ Mode string } // want mutable-package-state

var counter atomic.Int64

func Load(read func() map[string]string) map[string]string {
	once.Do(func() { loaded = read() })
	return loaded
}

func Count(values map[int]int) int {
	for total = range values {
		counter.Add(1)
	}
	return total
}

func Forget(key string) {
	delete(seen, key)
}

func Decode(read func(any) error) error {
	return read(&config)
}

func Seen(key string) bool {
	return seen[key]
}

func Configured() string {
	return config.Mode
}

func Calls() int64 {
	return counter.Load()
}
