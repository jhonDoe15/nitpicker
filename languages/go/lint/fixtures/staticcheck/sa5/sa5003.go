package sa5

import "sync"

func Forever(lock *sync.Mutex, jobs chan func()) {
	for {
		lock.Lock()
		defer lock.Unlock() // want SA5003
		job := <-jobs
		job()
	}
}

func Each(lock *sync.Mutex, jobs chan func()) {
	for job := range jobs {
		lock.Lock()
		job()
		lock.Unlock()
	}
}
