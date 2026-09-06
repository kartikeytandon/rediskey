package main

import (
	"context"
	"sort"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

type CommandStatSample struct {
	Command     string  `json:"command"`
	Calls       int64   `json:"calls"`
	Usec        int64   `json:"usec"`
	UsecPerCall float64 `json:"usecPerCall"`
}

type SlowlogShareSample struct {
	Command         string  `json:"command"`
	Count           int     `json:"count"`
	SharePct        float64 `json:"sharePct"`
	TotalDurationUs int64   `json:"totalDurationUs"`
}

type HotKeySample struct {
	Key         string `json:"key"`
	Bytes       int64  `json:"bytes"`
	IdleSeconds int64  `json:"idleSeconds,omitempty"`
	Freq        int64  `json:"freq,omitempty"`
}

func collectCommandStats(info map[string]string) []CommandStatSample {
	var out []CommandStatSample
	for key, val := range info {
		if !strings.HasPrefix(key, "cmdstat_") {
			continue
		}
		cmd := strings.TrimPrefix(key, "cmdstat_")
		fields := parseCmdStatFields(val)
		calls, okCalls := fields["calls"]
		usec, okUsec := fields["usec"]
		if !okCalls || calls <= 0 {
			continue
		}
		perCall := 0.0
		if okUsec && calls > 0 {
			perCall = float64(usec) / float64(calls)
		}
		out = append(out, CommandStatSample{
			Command:     strings.ToUpper(cmd),
			Calls:       calls,
			Usec:        usec,
			UsecPerCall: perCall,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Calls == out[j].Calls {
			return out[i].Usec > out[j].Usec
		}
		return out[i].Calls > out[j].Calls
	})
	if len(out) > 40 {
		out = out[:40]
	}
	return out
}

func parseCmdStatFields(raw string) map[string]int64 {
	out := map[string]int64{}
	for _, part := range strings.Split(raw, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		n, err := strconv.ParseInt(v, 10, 64)
		if err == nil {
			out[k] = n
		}
	}
	return out
}

func summarizeSlowlog(entries []SlowlogSample) []SlowlogShareSample {
	if len(entries) == 0 {
		return nil
	}
	type agg struct {
		count int
		usec  int64
	}
	byCmd := map[string]agg{}
	for _, e := range entries {
		cmd := strings.ToUpper(e.Command)
		if cmd == "" {
			continue
		}
		a := byCmd[cmd]
		a.count++
		a.usec += e.DurationUs
		byCmd[cmd] = a
	}
	total := len(entries)
	var out []SlowlogShareSample
	for cmd, a := range byCmd {
		out = append(out, SlowlogShareSample{
			Command:         cmd,
			Count:           a.count,
			SharePct:        100 * float64(a.count) / float64(total),
			TotalDurationUs: a.usec,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].TotalDurationUs > out[j].TotalDurationUs
		}
		return out[i].Count > out[j].Count
	})
	return out
}

func collectHotKeyHints(ctx context.Context, rdb *redis.Client, bigKeys []BigKeySample) []HotKeySample {
	if len(bigKeys) == 0 {
		return nil
	}
	limit := len(bigKeys)
	if limit > 24 {
		limit = 24
	}
	var out []HotKeySample
	for _, bk := range bigKeys[:limit] {
		hk := HotKeySample{Key: bk.Key, Bytes: bk.Bytes, IdleSeconds: -1}
		if idle, err := rdb.ObjectIdleTime(ctx, bk.Key).Result(); err == nil {
			hk.IdleSeconds = int64(idle.Seconds())
		}
		if freq, err := rdb.ObjectFreq(ctx, bk.Key).Result(); err == nil && freq > 0 {
			hk.Freq = freq
		}
		recent := hk.IdleSeconds >= 0 && hk.IdleSeconds < 300
		if hk.Freq > 0 || recent || bk.Bytes >= 1_000_000 {
			out = append(out, hk)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Freq != out[j].Freq {
			return out[i].Freq > out[j].Freq
		}
		if out[i].IdleSeconds != out[j].IdleSeconds {
			return out[i].IdleSeconds < out[j].IdleSeconds
		}
		return out[i].Bytes > out[j].Bytes
	})
	if len(out) > 24 {
		out = out[:24]
	}
	return out
}
