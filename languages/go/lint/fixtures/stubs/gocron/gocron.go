// Package gocron stands in for github.com/go-co-op/gocron/v2 in the fixtures.
package gocron

import "time"

type Task func()

type JobDefinition struct{}

type Job struct{}

type Scheduler struct{}

func DurationJob(time.Duration) JobDefinition {
	return JobDefinition{}
}

func NewTask(any, ...any) Task {
	return nil
}

func (*Scheduler) NewJob(JobDefinition, Task) (Job, error) {
	return Job{}, nil
}
