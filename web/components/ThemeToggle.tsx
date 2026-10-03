"use client";

export default function ThemeToggle({ label }: { label: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage can be blocked; the choice then lasts for this visit only
    }
  };
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
      </svg>
    </button>
  );
}
