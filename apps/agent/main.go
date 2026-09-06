package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"time"
)

const version = "0.0.5"

func main() {
	addr := flag.String("addr", "127.0.0.1:6379", "Redis/Valkey host:port")
	engine := flag.String("engine", "redis", "engine: redis or valkey")
	agentID := flag.String("agent-id", "local-dev", "agent id in telemetry JSON")
	printJSON := flag.Bool("print", false, "write each sample to stdout")
	ingestURL := flag.String("ingest-url", "", "API base URL, e.g. http://127.0.0.1:3001")
	interval := flag.Duration("interval", 0, "repeat collect+ingest (e.g. 10s). 0 = once")
	scanLimit := flag.Int("scan-limit", defaultScanLimit, "max keys to sample per collect (max 2000)")
	scanTimeout := flag.Duration("scan-timeout", defaultScanTimeout, "max time for SCAN per collect")
	noScan := flag.Bool("no-scan", false, "skip keyspace SCAN (INFO and SLOWLOG still collected)")
	flag.Parse()

	if *engine != "redis" && *engine != "valkey" {
		fmt.Fprintf(os.Stderr, "engine must be redis or valkey\n")
		os.Exit(2)
	}

	scan := scanOptsFromEnv()
	scan.Limit = *scanLimit
	scan.Timeout = *scanTimeout
	if *noScan {
		scan.Enabled = false
	}

	token := os.Getenv("AGENT_TOKEN")
	if token == "" {
		local := strings.Contains(*ingestURL, "127.0.0.1") || strings.Contains(*ingestURL, "localhost")
		if local {
			token = "dev-agent-token"
		} else if *ingestURL != "" {
			fmt.Fprintln(os.Stderr, "AGENT_TOKEN is required for non-local ingest URLs")
			os.Exit(2)
		}
	}

	log.SetOutput(os.Stderr)
	n := scan.normalized()
	if n.Enabled {
		log.Printf("agent %s scan limit=%d timeout=%s", version, n.Limit, n.Timeout)
	} else {
		log.Printf("agent %s scan disabled", version)
	}

	runOnce := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		payload, err := Collect(ctx, CollectOpts{
			Addr:     *addr,
			Engine:   *engine,
			AgentID:  *agentID,
			Version:  version,
			Password: os.Getenv("REDIS_PASSWORD"),
			Scan:     scan,
		})
		if err != nil {
			return fmt.Errorf("collect: %w", err)
		}
		if *printJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			if err := enc.Encode(payload); err != nil {
				return err
			}
		}
		if *ingestURL != "" {
			if err := postIngest(*ingestURL, token, payload); err != nil {
				return err
			}
		}
		if *ingestURL == "" && !*printJSON {
			fmt.Fprintln(os.Stderr, "nothing to do: pass --print and/or --ingest-url")
		}
		return nil
	}

	if err := runOnce(); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	if *interval <= 0 {
		return
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	t := time.NewTicker(*interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			if err := runOnce(); err != nil {
				fmt.Fprintf(os.Stderr, "%v\n", err)
			}
		}
	}
}
