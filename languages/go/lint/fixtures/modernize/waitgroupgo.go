package modernize

import "sync"

func RunAll(jobs []func()) {
	var group sync.WaitGroup
	for _, job := range jobs {
		group.Add(1)
		go func() { // want waitgroupgo
			defer group.Done()
			job()
		}()
	}
	group.Wait()
}

func RunAllGo(jobs []func()) {
	var group sync.WaitGroup
	for _, job := range jobs {
		group.Go(job)
	}
	group.Wait()
}
