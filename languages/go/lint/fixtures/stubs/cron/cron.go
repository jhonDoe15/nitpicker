// Package cron stands in for github.com/robfig/cron/v3 in the fixtures.
package cron

type EntryID int

type Cron struct{}

func (*Cron) AddFunc(string, func()) (EntryID, error) {
	return 0, nil
}
