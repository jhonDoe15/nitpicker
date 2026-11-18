package jobs

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-co-op/gocron/v2"
	"github.com/robfig/cron/v3"
)

const expire = "UPDATE sessions SET open = false WHERE tenant = $1"

func Schedule(ctx context.Context, db *sql.DB, tenants []string) error {
	runner := cron.Cron{}
	_, err := runner.AddFunc("@hourly", func() {
		for _, tenant := range tenants { // want failing-item-stops-job
			if _, err := db.ExecContext(ctx, expire, tenant); err != nil { // want io-in-loop swallowed-error
				log.Printf("expire %s: %v", tenant, err)
				return
			}
		}
	})
	return err
}

func Poll(client *http.Client, requests []*http.Request) error {
	scheduler := gocron.Scheduler{}
	_, err := scheduler.NewJob(gocron.DurationJob(time.Minute), gocron.NewTask(func() error {
		for _, request := range requests { // want failing-item-stops-job
			response, err := client.Do(request) // want io-in-loop
			if err != nil {
				return fmt.Errorf("poll: %w", err)
			}
			if err := response.Body.Close(); err != nil {
				return fmt.Errorf("close: %w", err)
			}
		}
		return nil
	}))
	return err
}

func ScheduleEach(ctx context.Context, db *sql.DB, tenants []string) error {
	runner := cron.Cron{}
	_, err := runner.AddFunc("@daily", func() {
		for _, tenant := range tenants {
			if _, err := db.ExecContext(ctx, expire, tenant); err != nil { // want io-in-loop swallowed-error
				log.Printf("expire %s: %v", tenant, err)
				continue
			}
		}
	})
	return err
}

func ScheduleJoined(ctx context.Context, db *sql.DB, tenants []string) error {
	scheduler := gocron.Scheduler{}
	_, err := scheduler.NewJob(gocron.DurationJob(time.Hour), gocron.NewTask(func() error {
		var failed error
		for _, tenant := range tenants {
			if _, err := db.ExecContext(ctx, expire, tenant); err != nil { // want io-in-loop
				failed = errors.Join(failed, fmt.Errorf("expire %s: %w", tenant, err))
			}
		}
		return failed
	}))
	return err
}

func ScheduleCount(tenants []string) error {
	runner := cron.Cron{}
	_, err := runner.AddFunc("@weekly", func() {
		for _, tenant := range tenants {
			if tenant == "" {
				return
			}
			log.Print(tenant)
		}
	})
	return err
}

func Sweep(ctx context.Context, db *sql.DB, tenants []string) error {
	for _, tenant := range tenants {
		if _, err := db.ExecContext(ctx, expire, tenant); err != nil { // want io-in-loop
			return err
		}
	}
	return nil
}
