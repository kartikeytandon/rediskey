package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultScanLimit   = 400
	maxScanLimit       = 2000
	defaultScanTimeout = 2500 * time.Millisecond
	minScanTimeout     = 500 * time.Millisecond
	maxScanTimeout     = 30 * time.Second
	scanBatchCount     = 32
	baseScanPause      = 8 * time.Millisecond
	maxScanPause       = 50 * time.Millisecond
)

type ScanOpts struct {
	Enabled bool
	Limit   int
	Timeout time.Duration
}

type scanResult struct {
	sample    *KeyspaceSample
	truncated bool
	complete  bool
	reason    string
}

func (o ScanOpts) normalized() ScanOpts {
	out := o
	if !out.Enabled {
		return out
	}
	if out.Limit <= 0 {
		out.Limit = defaultScanLimit
	}
	if out.Limit > maxScanLimit {
		log.Printf("scan: limit %d exceeds max %d; clamping", out.Limit, maxScanLimit)
		out.Limit = maxScanLimit
	}
	if out.Timeout <= 0 {
		out.Timeout = defaultScanTimeout
	}
	if out.Timeout < minScanTimeout {
		out.Timeout = minScanTimeout
	}
	if out.Timeout > maxScanTimeout {
		out.Timeout = maxScanTimeout
	}
	return out
}

func runKeyspaceScan(ctx context.Context, rdb *redis.Client, opts ScanOpts) (*scanResult, error) {
	opts = opts.normalized()
	if !opts.Enabled {
		log.Println("scan: skipped (--no-scan)")
		return nil, nil
	}

	sample, truncated, complete, reason, err := sampleKeyspace(ctx, rdb, opts.Limit, opts.Timeout)
	if err != nil {
		return nil, err
	}
	if sample == nil {
		return nil, nil
	}

	sample.ScanTruncated = truncated
	sample.ScanComplete = complete
	if truncated && reason != "" {
		sample.ScanReason = fmt.Sprintf("%s after %d keys (limit=%d timeout=%s)", reason, sample.Sampled, opts.Limit, opts.Timeout)
	}

	switch {
	case truncated:
		log.Printf("scan: truncated after %d keys (%s; limit=%d timeout=%s)", sample.Sampled, reason, opts.Limit, opts.Timeout)
	case complete:
		log.Printf("scan: complete %d keys", sample.Sampled)
	default:
		log.Printf("scan: sampled %d keys", sample.Sampled)
	}

	return &scanResult{
		sample:    sample,
		truncated: truncated,
		complete:  complete,
		reason:    reason,
	}, nil
}

func sampleKeyspace(ctx context.Context, rdb *redis.Client, limit int, timeout time.Duration) (*KeyspaceSample, bool, bool, string, error) {
	out := &KeyspaceSample{
		Namespaces: []NamespaceCount{},
		BigKeys:    []BigKeySample{},
	}
	ns := map[string]int{}
	type sized struct {
		key   string
		bytes int64
	}
	var sizes []sized

	deadline := time.Now().Add(timeout)
	truncated := false
	reason := ""
	var cursor uint64

	for out.Sampled < limit && time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			truncated = true
			reason = "context cancelled"
			break
		}

		keys, next, err := rdb.Scan(ctx, cursor, "*", scanBatchCount).Result()
		if err != nil {
			return nil, false, false, "", err
		}

		for _, key := range keys {
			if out.Sampled >= limit {
				truncated = true
				reason = "key limit"
				break
			}
			out.Sampled++
			ttl, err := rdb.TTL(ctx, key).Result()
			if err == nil {
				if ttl < 0 {
					out.WithoutTTL++
				} else {
					out.WithTTL++
				}
			}
			prefix := namespaceOf(key)
			ns[prefix]++
			n, err := rdb.Do(ctx, "MEMORY", "USAGE", key).Int64()
			if err == nil {
				sizes = append(sizes, sized{key: key, bytes: n})
			}
		}

		cursor = next
		if cursor == 0 {
			break
		}
		if truncated {
			break
		}
		if time.Now().After(deadline) {
			truncated = true
			reason = "timeout"
			break
		}
		time.Sleep(scanPause(out.Sampled))
	}

	if cursor != 0 && !truncated && out.Sampled >= limit {
		truncated = true
		reason = "key limit"
	}
	if cursor != 0 && time.Now().After(deadline) && reason == "" {
		truncated = true
		reason = "timeout"
	}

	complete := cursor == 0 && !truncated

	sort.Slice(sizes, func(i, j int) bool { return sizes[i].bytes > sizes[j].bytes })
	if len(sizes) > 24 {
		sizes = sizes[:24]
	}
	for _, s := range sizes {
		out.BigKeys = append(out.BigKeys, BigKeySample{Key: s.key, Bytes: s.bytes})
	}

	type kv struct {
		p string
		n int
	}
	var list []kv
	for p, n := range ns {
		list = append(list, kv{p, n})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].n > list[j].n })
	if len(list) > 40 {
		list = list[:40]
	}
	for _, x := range list {
		out.Namespaces = append(out.Namespaces, NamespaceCount{Prefix: x.p, Count: x.n})
	}
	if out.Sampled > 0 {
		out.MissingTTLPct = 100 * float64(out.WithoutTTL) / float64(out.Sampled)
	}
	return out, truncated, complete, reason, nil
}

func scanPause(sampled int) time.Duration {
	pause := baseScanPause + time.Duration(sampled/50)*time.Millisecond
	if pause > maxScanPause {
		return maxScanPause
	}
	return pause
}

func namespaceOf(key string) string {
	if i := strings.IndexByte(key, ':'); i > 0 {
		return key[:i]
	}
	if i := strings.IndexByte(key, '.'); i > 0 {
		return key[:i]
	}
	return "(none)"
}

func scanOptsFromEnv() ScanOpts {
	opts := ScanOpts{Enabled: true, Limit: defaultScanLimit, Timeout: defaultScanTimeout}
	if v := os.Getenv("BALTAN_NO_SCAN"); v == "1" || strings.EqualFold(v, "true") {
		opts.Enabled = false
	}
	if v := os.Getenv("BALTAN_SCAN_LIMIT"); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			opts.Limit = n
		}
	}
	if v := os.Getenv("BALTAN_SCAN_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			opts.Timeout = d
		}
	}
	return opts
}
