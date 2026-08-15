package main

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type CollectOpts struct {
	Addr      string
	Engine    string
	AgentID   string
	Version   string
	Password  string
	ScanLimit int
}

func Collect(ctx context.Context, opts CollectOpts) (*TelemetryPayload, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     opts.Addr,
		Password: opts.Password,
		DB:       0,
	})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping %s: %w", opts.Addr, err)
	}

	now := time.Now().UTC()
	infoRaw, err := rdb.Info(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("INFO: %w", err)
	}
	info := parseInfo(infoRaw)

	var metrics []MetricSample
	add := func(name string, raw string) {
		if raw == "" {
			return
		}
		v, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return
		}
		metrics = append(metrics, metric(name, v, now))
	}

	add("used_memory", info["used_memory"])
	add("used_memory_rss", info["used_memory_rss"])
	add("used_memory_peak", info["used_memory_peak"])
	add("maxmemory", info["maxmemory"])
	add("mem_fragmentation_ratio", info["mem_fragmentation_ratio"])
	add("instantaneous_ops_per_sec", info["instantaneous_ops_per_sec"])
	add("connected_clients", info["connected_clients"])
	add("blocked_clients", info["blocked_clients"])
	add("rejected_connections", info["rejected_connections"])
	add("keyspace_hits", info["keyspace_hits"])
	add("keyspace_misses", info["keyspace_misses"])
	add("evicted_keys", info["evicted_keys"])
	add("expired_keys", info["expired_keys"])
	add("total_commands_processed", info["total_commands_processed"])
	add("uptime_in_seconds", info["uptime_in_seconds"])
	add("connected_replicas", firstNonEmpty(info["connected_slaves"], info["connected_replicas"]))

	if stats, err := memoryStatsMap(ctx, rdb); err == nil {
		if v, ok := asFloat(stats["fragmentation.bytes"]); ok {
			metrics = append(metrics, metric("memory_fragmentation_bytes", v, now))
		}
		if v, ok := asFloat(stats["peak.allocated"]); ok {
			metrics = append(metrics, metric("memory_peak_allocated", v, now))
		}
	}

	rawClients, err := rdb.ClientList(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("CLIENT LIST: %w", err)
	}
	metrics = append(metrics, metric("client_list_count", float64(countNonEmptyLines(rawClients)), now))

	slowlog, err := collectSlowlog(ctx, rdb)
	if err != nil {
		return nil, fmt.Errorf("SLOWLOG: %w", err)
	}

	keyspace, err := sampleKeyspace(ctx, rdb, opts.ScanLimit)
	if err != nil {
		return nil, fmt.Errorf("SCAN: %w", err)
	}
	if keyspace.Sampled > 0 {
		add("keyspace_sampled", strconv.Itoa(keyspace.Sampled))
		add("keys_with_ttl", strconv.Itoa(keyspace.WithTTL))
		add("keys_without_ttl", strconv.Itoa(keyspace.WithoutTTL))
		metrics = append(metrics, metric("ttl_missing_pct", keyspace.MissingTTLPct, now))
		if len(keyspace.BigKeys) > 0 {
			metrics = append(metrics, metric("biggest_key_bytes", float64(keyspace.BigKeys[0].Bytes), now))
		}
	}

	server := map[string]string{}
	for _, k := range []string{"redis_version", "valkey_version", "os", "tcp_port", "role", "executable"} {
		if v := info[k]; v != "" {
			server[k] = v
		}
	}

	return &TelemetryPayload{
		AgentID:     opts.AgentID,
		Engine:      opts.Engine,
		Version:     opts.Version,
		CollectedAt: now.Format(time.RFC3339Nano),
		Server:      server,
		Metrics:     metrics,
		Slowlog:     slowlog,
		Keyspace:    keyspace,
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func parseInfo(raw string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		out[key] = strings.TrimSpace(val)
	}
	return out
}

func memoryStatsMap(ctx context.Context, rdb *redis.Client) (map[string]any, error) {
	raw, err := rdb.Do(ctx, "MEMORY", "STATS").Result()
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	flattenPairs(raw, "", out)
	return out, nil
}

func flattenPairs(raw any, prefix string, out map[string]any) {
	items, ok := raw.([]any)
	if !ok {
		return
	}
	for i := 0; i+1 < len(items); i += 2 {
		key, ok := items[i].(string)
		if !ok {
			continue
		}
		if prefix != "" {
			key = prefix + "." + key
		}
		val := items[i+1]
		if nested, isSlice := val.([]any); isSlice {
			flattenPairs(nested, key, out)
			continue
		}
		out[key] = val
	}
}

func countNonEmptyLines(raw string) int {
	n := 0
	for _, line := range strings.Split(raw, "\n") {
		if strings.TrimSpace(line) != "" {
			n++
		}
	}
	return n
}

func asFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case int64:
		return float64(t), true
	case int:
		return float64(t), true
	case uint64:
		return float64(t), true
	case float64:
		return t, true
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func collectSlowlog(ctx context.Context, rdb *redis.Client) ([]SlowlogSample, error) {
	entries, err := rdb.SlowLogGet(ctx, 16).Result()
	if err != nil {
		return nil, err
	}
	out := make([]SlowlogSample, 0, len(entries))
	for _, e := range entries {
		cmd := ""
		if len(e.Args) > 0 {
			cmd = strings.ToUpper(e.Args[0])
		}
		out = append(out, SlowlogSample{
			ID:         e.ID,
			DurationUs: e.Duration.Microseconds(),
			Command:    cmd,
		})
	}
	return out, nil
}
