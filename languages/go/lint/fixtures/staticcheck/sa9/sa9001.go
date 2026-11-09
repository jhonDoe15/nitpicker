package sa9

import "sync"

func HoldAll(lock *sync.Mutex, jobs chan func()) {
	for job := range jobs {
		lock.Lock()
		defer lock.Unlock() // want SA9001
		job()
	}
}

func HoldEach(lock *sync.Mutex, jobs chan func()) {
	for job := range jobs {
		runLocked(lock, job)
	}
}

func runLocked(lock *sync.Mutex, job func()) {
	lock.Lock()
	defer lock.Unlock()
	job()
}
