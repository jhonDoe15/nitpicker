package guards

type Store struct {
	items map[string]int
}

type Sink interface {
	Push(key string, value int)
}

func (store *Store) Lookup(key string) (int, bool) {
	value, found := store.items[key]
	return value, found
}

func (store *Store) Find(key string) (int, bool) { // want forwarding-method-alias
	return store.Lookup(key)
}

func (store *Store) Save(key string, value int) {
	store.items[key] = value
}

func (store *Store) Put(key string, value int) { // want forwarding-method-alias
	store.Save(key, value)
}

func (store *Store) Push(key string, value int) {
	store.Save(key, value)
}

func (store *Store) Drop(keys ...string) {
	for _, key := range keys {
		delete(store.items, key)
	}
}

func (store *Store) Forget(keys ...string) { // want forwarding-method-alias
	store.Drop(keys...)
}

func (store *Store) Write(data []byte) (int, error) {
	return store.write(data)
}

func (store *Store) write(data []byte) (int, error) {
	store.items[string(data)]++
	return len(data), nil
}

func (store *Store) Swap(first, second string) {
	store.Move(second, first)
}

func (store *Store) Move(from, to string) {
	store.items[to] = store.items[from]
	delete(store.items, from)
}

func (store *Store) Value(key string) int {
	value, _ := store.Lookup(key)
	return value
}
