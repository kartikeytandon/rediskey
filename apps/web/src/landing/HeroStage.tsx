import { motion, useReducedMotion } from "motion/react";

const FINDINGS = [
  { tag: "high", title: "missing TTL", detail: "session:* · 41% no expiry" },
  { tag: "mid", title: "big key", detail: "cache:feed · 18.4 MB" },
  { tag: "high", title: "slowlog", detail: "KEYS · 842 ms" },
];

export function HeroStage() {
  const reduce = useReducedMotion();

  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-stage-grid" />
      <div className="lp-stage-scene">
        <motion.div
          className="lp-node lp-node-redis"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="lp-node-label">Redis</span>
          <span className="lp-node-meta">:6379 private</span>
          <div className="lp-node-bars">
            <i style={{ width: "72%" }} />
            <i style={{ width: "44%" }} />
            <i style={{ width: "91%" }} />
          </div>
        </motion.div>

        <motion.div
          className="lp-pipe"
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="lp-pipe-pulse"
            animate={reduce ? undefined : { x: ["0%", "110%"] }}
            transition={
              reduce
                ? undefined
                : { duration: 1.8, repeat: Infinity, ease: "linear", repeatDelay: 0.6 }
            }
          />
        </motion.div>

        <motion.div
          className="lp-node lp-node-agent"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="lp-node-label">agent</span>
          <span className="lp-node-meta">read-only · HTTPS out</span>
          <motion.div
            className="lp-agent-ring"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={reduce ? undefined : { duration: 8, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>

        <motion.div
          className="lp-pipe lp-pipe-long"
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.55, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="lp-pipe-pulse"
            animate={reduce ? undefined : { x: ["0%", "110%"] }}
            transition={
              reduce
                ? undefined
                : { duration: 2.1, repeat: Infinity, ease: "linear", repeatDelay: 0.4, delay: 0.4 }
            }
          />
        </motion.div>

        <motion.div
          className="lp-panel"
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lp-panel-top">
            <span>health</span>
            <motion.strong
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              68
            </motion.strong>
          </div>
          <div className="lp-panel-meter">
            <motion.i
              initial={reduce ? { width: "68%" } : { width: "0%" }}
              animate={{ width: "68%" }}
              transition={{ delay: 0.85, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <ul className="lp-panel-findings">
            {FINDINGS.map((f, i) => (
              <motion.li
                key={f.title}
                className={`lp-finding-chip ${f.tag}`}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.12, duration: 0.4 }}
              >
                <em>{f.title}</em>
                <span>{f.detail}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
