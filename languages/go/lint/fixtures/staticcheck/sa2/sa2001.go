package sa2

import "sync"

type Store struct {
	lock  sync.Mutex
	Items []string
}

func (store *Store) Empty() {
	store.lock.Lock()
	store.lock.Unlock() // want SA2001
}

func (store *Store) Add(item string) {
	store.lock.Lock()
	defer store.lock.Unlock()
	store.Items = append(store.Items, item)
}
