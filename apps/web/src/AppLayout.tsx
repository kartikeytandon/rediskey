import { BrandMark } from "./BrandMark";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { DbRow } from "./api";

export type AppPage = "dashboard" | "install" | "alerts";

export function AppLayout({
  page,
  databases,
  databaseId,
  email,
  onSelectDatabase,
  onAddDatabase,
  onNavigate,
  onLogout,
  children,
}: {
  page: AppPage;
  databases: DbRow[];
  databaseId: string;
  email: string;
  onSelectDatabase: (id: string) => void;
  onAddDatabase: () => void;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const activeDb = databases.find((d) => d.id === databaseId) ?? databases[0];
  const [dbOpen, setDbOpen] = useState(false);
  const dbMenuId = useId();
  const dbWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dbOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!dbWrapRef.current?.contains(e.target as Node)) setDbOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDbOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [dbOpen]);

  return (
    <div className="shell">
      <header className="nav">
        <a
          className="brand"
          href="/app"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("dashboard");
          }}
        >
          <BrandMark />
        </a>

        <nav className="app-tabs" aria-label="Main">
          <button
            type="button"
            className={`app-tab ${page === "dashboard" ? "on" : ""}`}
            onClick={() => onNavigate("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`app-tab ${page === "install" ? "on" : ""}`}
            onClick={() => onNavigate("install")}
          >
            Install
          </button>
          <button
            type="button"
            className={`app-tab ${page === "alerts" ? "on" : ""}`}
            onClick={() => onNavigate("alerts")}
          >
            Alerts
          </button>
        </nav>

        <div className="nav-right">
          <div className="nav-db">
            <div className="db-picker" ref={dbWrapRef}>
              <span className="db-switcher-label">Instance</span>
              <button
                type="button"
                className={`db-picker-btn ${dbOpen ? "open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={dbOpen}
                aria-controls={dbMenuId}
                onClick={() => setDbOpen((o) => !o)}
              >
                <span className="db-picker-name">
                  {activeDb?.name ?? "Select instance"}
                </span>
                {activeDb ? <span className="db-picker-engine">{activeDb.engine}</span> : null}
                <span className="db-picker-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {dbOpen ? (
                <ul className="db-picker-menu" id={dbMenuId} role="listbox">
                  {databases.map((db) => (
                    <li key={db.id} role="option" aria-selected={db.id === activeDb?.id}>
                      <button
                        type="button"
                        className={db.id === activeDb?.id ? "on" : undefined}
                        onClick={() => {
                          onSelectDatabase(db.id);
                          setDbOpen(false);
                        }}
                      >
                        <span>{db.name}</span>
                        <span className="db-picker-engine">{db.engine}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" className="ghost db-add" onClick={onAddDatabase} title="Add database">
              +
            </button>
          </div>

          <div className="nav-user">
            <span className="nav-email" title={email}>
              {email}
            </span>
            <button type="button" className="ghost nav-logout" onClick={() => onLogout()}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
