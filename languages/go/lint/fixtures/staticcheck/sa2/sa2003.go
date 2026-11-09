package sa2

import "sync"

var (
	registryLock sync.Mutex // want mutable-package-state
	registry     = map[string]string{}
)

func LookupWrong(key string) string {
	registryLock.Lock()
	defer registryLock.Lock() // want SA2003
	return registry[key]
}

func Lookup(key string) string {
	registryLock.Lock()
	defer registryLock.Unlock()
	return registry[key]
}
