import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000";
const API_URL = `${API_BASE}/api/usage`;
const TIMETABLE_API = `${API_BASE}/api/timetable`;

const PRODUCTIVE_SITES = [
  "github.com",
  "leetcode.com",
  "stackoverflow.com",
  "developer.mozilla.org",
  "react.dev",
  "vite.dev",
  "chatgpt.com",
  "localhost",
];

const DISTRACTION_SITES = [
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "netflix.com",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getSiteName(domain) {
  if (!domain) return "Unknown";

  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/^\w/, (c) => c.toUpperCase());
}

function getCategory(domain) {
  if (!domain) return "Other";

  const clean = domain.toLowerCase();

  if (PRODUCTIVE_SITES.some((site) => clean.includes(site))) {
    return "Productive";
  }

  if (DISTRACTION_SITES.some((site) => clean.includes(site))) {
    return "Distraction";
  }

  return "Other";
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRangeStart(range) {
  const now = new Date();

  if (range === "Today") {
    return getLocalDateKey(now);
  }

  const start = new Date(now);

  if (range === "This week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  }

  if (range === "This month") {
    start.setDate(1);
  }

  return getLocalDateKey(start);
}

function isRecordInRange(record, range) {
  if (!record?.timestamp) return false;

  const timestamp = new Date(record.timestamp);
  if (Number.isNaN(timestamp.getTime())) return false;

  const now = new Date();

  if (range === "Today") {
    return getLocalDateKey(timestamp) === getLocalDateKey(now);
  }

  const start = new Date(`${getRangeStart(range)}T00:00:00`);
  const end = new Date(now);

  return timestamp >= start && timestamp <= end;
}

function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function getTodayDayName() {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[new Date().getDay()];
}

function getTimetableStatus(item, usage) {
  if (!item.enabled) return "Disabled";

  const now = new Date();
  const today = getTodayDayName();

  if (!item.days?.includes(today)) return "Upcoming";

  const [hours, minutes] = item.time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);

  if (scheduled > now) return "Upcoming";

  const graceStart = new Date(scheduled);
  graceStart.setMinutes(graceStart.getMinutes() - 30);

  const graceEnd = new Date(scheduled);
  graceEnd.setMinutes(graceEnd.getMinutes() + 45);

  const visited = usage.some((record) => {
    if (!record.timestamp || !record.domain) return false;

    const timestamp = new Date(record.timestamp);

    return (
      normalizeDomain(record.domain) === normalizeDomain(item.domain) &&
      timestamp >= graceStart &&
      timestamp <= graceEnd
    );
  });

  if (visited) return "Completed";

  return "Missed";
}

function App() {
  const [usage, setUsage] = useState([]);
  const [timetable, setTimetable] = useState([]);

  const [loading, setLoading] = useState(true);
  const [timetableLoading, setTimetableLoading] = useState(true);

  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [range, setRange] = useState("Today");

  const [goal, setGoal] = useState(() => {
    const saved = localStorage.getItem("focusflowGoal");
    return saved ? Number(saved) : 120;
  });

  const [showTimetableForm, setShowTimetableForm] = useState(false);
  const [savingTimetable, setSavingTimetable] = useState(false);
  const [timetableError, setTimetableError] = useState("");

  const [newTask, setNewTask] = useState({
    title: "",
    domain: "",
    time: "19:00",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    enabled: true,
  });

  useEffect(() => {
    fetchUsage();
    fetchTimetable();

    const interval = setInterval(() => {
      fetchUsage();
      fetchTimetable();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("focusflowGoal", String(goal));
  }, [goal]);

  useEffect(() => {
    const sections = document.querySelectorAll(".dashboard-section");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        threshold: [0.2, 0.4, 0.6],
        rootMargin: "-15% 0px -55% 0px",
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [timetable.length]);

  async function fetchUsage() {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("Failed to fetch usage");
      }

      const data = await response.json();

      setUsage(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error("FocusFlow usage:", error);
      setLoading(false);
    }
  }

  async function fetchTimetable() {
    try {
      const response = await fetch(TIMETABLE_API);

      if (!response.ok) {
        throw new Error("Failed to fetch timetable");
      }

      const data = await response.json();
      setTimetable(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("FocusFlow timetable:", error);
    } finally {
      setTimetableLoading(false);
    }
  }

  const filteredUsage = useMemo(
    () => usage.filter((record) => isRecordInRange(record, range)),
    [usage, range]
  );

  const siteData = useMemo(() => {
    const grouped = {};

    filteredUsage.forEach((record) => {
      if (!record.domain) return;

      if (!grouped[record.domain]) {
        grouped[record.domain] = {
          domain: record.domain,
          duration: 0,
          category: getCategory(record.domain),
          sessions: 0,
        };
      }

      grouped[record.domain].duration += Number(record.duration) || 0;
      grouped[record.domain].sessions += 1;
    });

    return Object.values(grouped).sort(
      (a, b) => b.duration - a.duration
    );
  }, [filteredUsage]);

  const totalTime = siteData.reduce(
    (sum, site) => sum + site.duration,
    0
  );

  const productiveTime = siteData
    .filter((site) => site.category === "Productive")
    .reduce((sum, site) => sum + site.duration, 0);

  const distractionTime = siteData
    .filter((site) => site.category === "Distraction")
    .reduce((sum, site) => sum + site.duration, 0);

  const websites = siteData.length;

  const longestSession = filteredUsage.length
    ? Math.max(
        ...filteredUsage.map(
          (record) => Number(record.duration) || 0
        )
      )
    : 0;

  const focusScore =
    totalTime > 0
      ? Math.min(
          100,
          Math.round(
            ((productiveTime +
              Math.max(
                totalTime - distractionTime - productiveTime,
                0
              ) *
                0.5) /
              totalTime) *
              100
          )
        )
      : 0;

  const goalProgress =
    goal > 0
      ? Math.min(
          100,
          Math.round((totalTime / 60000 / goal) * 100)
        )
      : 0;

  const productivityPercent =
    totalTime > 0
      ? Math.round((productiveTime / totalTime) * 100)
      : 0;

  const distractionPercent =
    totalTime > 0
      ? Math.round((distractionTime / totalTime) * 100)
      : 0;

  const timetableWithStatus = useMemo(
    () =>
      timetable.map((item) => ({
        ...item,
        status: getTimetableStatus(item, usage),
      })),
    [timetable, usage]
  );

  const todayTimetable = timetableWithStatus
    .filter((item) => item.days?.includes(getTodayDayName()))
    .sort((a, b) => a.time.localeCompare(b.time));

  function scrollTo(id) {
    const element = document.getElementById(id);

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    setMobileMenu(false);
  }

  function toggleDay(day) {
    setNewTask((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day],
    }));
  }

  async function createTimetableItem(event) {
    event.preventDefault();
    setTimetableError("");

    if (!newTask.title.trim()) {
      setTimetableError("Give this timetable item a name.");
      return;
    }

    if (!newTask.domain.trim()) {
      setTimetableError("Add the website you want to visit.");
      return;
    }

    if (newTask.days.length === 0) {
      setTimetableError("Select at least one day.");
      return;
    }

    setSavingTimetable(true);

    try {
      const response = await fetch(TIMETABLE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newTask.title,
          domain: normalizeDomain(newTask.domain),
          time: newTask.time,
          days: newTask.days,
          enabled: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create timetable");
      }

      setTimetable((current) => [
        ...current,
        result.data,
      ]);

      setNewTask({
        title: "",
        domain: "",
        time: "19:00",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        enabled: true,
      });

      setShowTimetableForm(false);
    } catch (error) {
      console.error("FocusFlow timetable:", error);
      setTimetableError(error.message);
    } finally {
      setSavingTimetable(false);
    }
  }

  async function toggleTimetableItem(item) {
    try {
      const response = await fetch(
        `${TIMETABLE_API}/${item.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            enabled: !item.enabled,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update timetable");
      }

      setTimetable((current) =>
        current.map((entry) =>
          entry.id === item.id ? result.data : entry
        )
      );
    } catch (error) {
      console.error("FocusFlow timetable:", error);
    }
  }

  async function deleteTimetableItem(id) {
    try {
      const response = await fetch(
        `${TIMETABLE_API}/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error || "Failed to delete timetable"
        );
      }

      setTimetable((current) =>
        current.filter((item) => item.id !== id)
      );
    } catch (error) {
      console.error("FocusFlow timetable:", error);
    }
  }

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}
      >
        <div className="brand">
          <div className="brand-mark">F</div>

          <div>
            <div className="brand-name">FocusFlow</div>
            <div className="brand-subtitle">
              PRODUCTIVITY OS
            </div>
          </div>
        </div>

        <nav className="navigation">
          <button
            className={
              activeSection === "overview" ? "active" : ""
            }
            onClick={() => scrollTo("overview")}
          >
            <span className="nav-icon">⌂</span>
            Overview
          </button>

          <button
            className={
              activeSection === "analytics" ? "active" : ""
            }
            onClick={() => scrollTo("analytics")}
          >
            <span className="nav-icon">◷</span>
            Analytics
          </button>

          <button
            className={
              activeSection === "websites" ? "active" : ""
            }
            onClick={() => scrollTo("websites")}
          >
            <span className="nav-icon">◎</span>
            Websites
          </button>

          <button
            className={
              activeSection === "timetable" ? "active" : ""
            }
            onClick={() => scrollTo("timetable")}
          >
            <span className="nav-icon">◫</span>
            Timetable
          </button>

          <button
            className={
              activeSection === "goals" ? "active" : ""
            }
            onClick={() => scrollTo("goals")}
          >
            <span className="nav-icon">◇</span>
            Goals
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="extension-status">
            <span className="status-dot"></span>

            <div>
              <strong>FocusFlow Extension</strong>
              <span>Tracking activity</span>
            </div>
          </div>

          <div className="version">
            FOCUSFLOW · V1.1
          </div>
        </div>
      </aside>

      <button
        className="mobile-menu-button"
        onClick={() => setMobileMenu((value) => !value)}
        aria-label="Toggle navigation"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {mobileMenu && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">YOUR PRODUCTIVITY</div>

            <h1>{getGreeting()}</h1>

            <p>
              Here's how you've been spending your time.
            </p>
          </div>

          <select
            value={range}
            onChange={(event) =>
              setRange(event.target.value)
            }
            className="range-selector"
          >
            <option>Today</option>
            <option>This week</option>
            <option>This month</option>
          </select>
        </header>

        <section
          id="overview"
          className="dashboard-section"
        >
          <div className="hero-grid">
            <article className="card focus-card reveal">
              <div className="card-glow"></div>

              <div className="card-label">FOCUS SCORE</div>

              <div className="focus-content">
                <div>
                  <div className="focus-number">
                    {focusScore}
                  </div>

                  <div className="focus-description">
                    {focusScore >= 80
                      ? "Excellent focus"
                      : focusScore >= 60
                      ? "Solid focus"
                      : "Room to improve"}
                  </div>
                </div>

                <div
                  className="score-ring"
                  style={{
                    "--progress": `${focusScore * 3.6}deg`,
                  }}
                >
                  <div>{focusScore}%</div>
                </div>
              </div>

              <div className="score-line">
                <span
                  style={{
                    width: `${focusScore}%`,
                  }}
                ></span>
              </div>

              <p className="card-description">
                Your focus score is calculated from productive
                activity and overall time distribution.
              </p>
            </article>

            <StatCard
              icon="◷"
              label="SCREEN TIME"
              value={formatDuration(totalTime)}
              footer={range}
            />

            <StatCard
              icon="◎"
              label="WEBSITES"
              value={websites}
              footer="Unique websites"
            />

            <StatCard
              icon="↗"
              label="LONGEST SESSION"
              value={formatDuration(longestSession)}
              footer="Largest tracked segment"
            />
          </div>
        </section>

        <section
          id="analytics"
          className="dashboard-section"
        >
          <div className="section-header">
            <div>
              <div className="eyebrow">ACTIVITY</div>
              <h2>Where your time went</h2>
            </div>

            <span className="section-badge">
              {range}
            </span>
          </div>

          <div className="analytics-grid">
            <article className="card activity-card reveal">
              {loading ? (
                <div className="empty-state">
                  Loading activity...
                </div>
              ) : siteData.length === 0 ? (
                <div className="empty-state">
                  No activity recorded for this range.
                </div>
              ) : (
                <div className="website-list">
                  {siteData.slice(0, 6).map(
                    (site, index) => {
                      const percentage =
                        totalTime > 0
                          ? (site.duration / totalTime) *
                            100
                          : 0;

                      return (
                        <div
                          className="website-row"
                          key={site.domain}
                          style={{
                            "--delay": `${index * 70}ms`,
                          }}
                        >
                          <div className="website-identity">
                            <div className="website-icon">
                              {site.domain
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {site.domain}
                              </strong>
                              <span>
                                {getSiteName(
                                  site.domain
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="website-progress">
                            <div className="progress-track">
                              <span
                                style={{
                                  width: `${percentage}%`,
                                }}
                              ></span>
                            </div>
                          </div>

                          <div className="website-time">
                            {formatDuration(
                              site.duration
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </article>

            <article className="card breakdown-card reveal">
              <div className="card-label">
                BREAKDOWN
              </div>

              <h3>{range}'s balance</h3>

              <div className="balance-item">
                <div className="balance-heading">
                  <span>Productive</span>
                  <strong>
                    {productivityPercent}%
                  </strong>
                </div>

                <div className="balance-track">
                  <span
                    style={{
                      width: `${productivityPercent}%`,
                    }}
                  />
                </div>
              </div>

              <div className="balance-item">
                <div className="balance-heading">
                  <span>Distractions</span>
                  <strong>
                    {distractionPercent}%
                  </strong>
                </div>

                <div className="balance-track">
                  <span
                    className="danger-bar"
                    style={{
                      width: `${distractionPercent}%`,
                    }}
                  />
                </div>
              </div>

              <div className="balance-summary">
                <div>
                  <span>Tracked</span>
                  <strong>
                    {formatDuration(totalTime)}
                  </strong>
                </div>

                <div>
                  <span>Productive</span>
                  <strong>
                    {formatDuration(productiveTime)}
                  </strong>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section
          id="websites"
          className="dashboard-section"
        >
          <div className="section-header">
            <div>
              <div className="eyebrow">WEBSITES</div>
              <h2>Your digital footprint</h2>
            </div>

            <span className="section-badge">
              {websites} tracked
            </span>
          </div>

          <article className="card websites-card reveal">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Website</th>
                    <th>Category</th>
                    <th>Sessions</th>
                    <th>Time</th>
                    <th>Share</th>
                  </tr>
                </thead>

                <tbody>
                  {siteData.map((site) => {
                    const share =
                      totalTime > 0
                        ? Math.round(
                            (site.duration /
                              totalTime) *
                              100
                          )
                        : 0;

                    return (
                      <tr key={site.domain}>
                        <td>
                          <div className="table-site">
                            <div className="website-icon small">
                              {site.domain
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {site.domain}
                              </strong>
                              <span>
                                {getSiteName(
                                  site.domain
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`category ${site.category
                              .toLowerCase()
                              .replace(" ", "-")}`}
                          >
                            {site.category}
                          </span>
                        </td>

                        <td>{site.sessions}</td>

                        <td>
                          {formatDuration(
                            site.duration
                          )}
                        </td>

                        <td>
                          <div className="share-cell">
                            <span>{share}%</span>

                            <div>
                              <i
                                style={{
                                  width: `${share}%`,
                                }}
                              ></i>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {siteData.length === 0 && (
                    <tr>
                      <td colSpan="5">
                        No website activity for this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section
          id="timetable"
          className="dashboard-section"
        >
          <div className="section-header">
            <div>
              <div className="eyebrow">
                TIMETABLE
              </div>

              <h2>Plan your focus blocks</h2>
            </div>

            <button
              className="timetable-add-button"
              onClick={() =>
                setShowTimetableForm(
                  (value) => !value
                )
              }
            >
              {showTimetableForm
                ? "Close"
                : "+ Add task"}
            </button>
          </div>

          <div className="timetable-grid">
            {showTimetableForm && (
              <article className="card timetable-form-card reveal">
                <div className="card-label">
                  NEW TIMETABLE ITEM
                </div>

                <h3>Don't forget your next focus block.</h3>

                <form onSubmit={createTimetableItem}>
                  <label>
                    Task
                    <input
                      type="text"
                      placeholder="DSA Practice"
                      value={newTask.title}
                      onChange={(event) =>
                        setNewTask((current) => ({
                          ...current,
                          title:
                            event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Website
                    <input
                      type="text"
                      placeholder="leetcode.com"
                      value={newTask.domain}
                      onChange={(event) =>
                        setNewTask((current) => ({
                          ...current,
                          domain:
                            event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Time
                    <input
                      type="time"
                      value={newTask.time}
                      onChange={(event) =>
                        setNewTask((current) => ({
                          ...current,
                          time:
                            event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="day-picker">
                    <span>Repeat</span>

                    <div className="day-buttons">
                      {DAYS.map((day) => (
                        <button
                          type="button"
                          key={day}
                          className={
                            newTask.days.includes(
                              day
                            )
                              ? "selected"
                              : ""
                          }
                          onClick={() =>
                            toggleDay(day)
                          }
                        >
                          {day.charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {timetableError && (
                    <div className="timetable-error">
                      {timetableError}
                    </div>
                  )}

                  <button
                    className="timetable-submit"
                    type="submit"
                    disabled={savingTimetable}
                  >
                    {savingTimetable
                      ? "Saving..."
                      : "Add to timetable"}
                  </button>
                </form>
              </article>
            )}

            <article className="card timetable-list-card reveal">
              <div className="timetable-list-header">
                <div>
                  <div className="card-label">
                    TODAY
                  </div>
                  <h3>Your focus schedule</h3>
                </div>

                <span className="section-badge">
                  {todayTimetable.length} tasks
                </span>
              </div>

              {timetableLoading ? (
                <div className="empty-state">
                  Loading timetable...
                </div>
              ) : todayTimetable.length === 0 ? (
                <div className="empty-state timetable-empty">
                  <div className="empty-icon">
                    ◫
                  </div>

                  <strong>
                    Nothing scheduled today.
                  </strong>

                  <span>
                    Add a focus block and FocusFlow
                    will keep it on your radar.
                  </span>
                </div>
              ) : (
                <div className="timetable-items">
                  {todayTimetable.map((item) => (
                    <div
                      className="timetable-item"
                      key={item.id}
                    >
                      <div className="timetable-time">
                        {item.time}
                      </div>

                      <div className="timetable-line">
                        <span></span>
                      </div>

                      <div className="timetable-task">
                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {item.domain}
                        </span>

                        <small>
                          {item.status ===
                          "Completed"
                            ? "✓ Completed"
                            : item.status ===
                              "Missed"
                            ? "Reminder needed"
                            : "Upcoming"}
                        </small>
                      </div>

                      <div className="timetable-actions">
                        <button
                          type="button"
                          onClick={() =>
                            toggleTimetableItem(
                              item
                            )
                          }
                          title={
                            item.enabled
                              ? "Disable"
                              : "Enable"
                          }
                        >
                          {item.enabled
                            ? "ON"
                            : "OFF"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteTimetableItem(
                              item.id
                            )
                          }
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          <div className="card timetable-note reveal">
            <div className="insight-icon">✦</div>

            <div>
              <strong>
                Smart reminders are coming next.
              </strong>

              <p>
                FocusFlow will check whether you've
                actually visited the scheduled website
                before reminding you. No unnecessary
                notifications.
              </p>
            </div>
          </div>
        </section>

        <section
          id="goals"
          className="dashboard-section"
        >
          <div className="section-header">
            <div>
              <div className="eyebrow">GOALS</div>
              <h2>Build your focus streak</h2>
            </div>
          </div>

          <div className="goals-grid">
            <article className="card goal-card reveal">
              <div className="goal-top">
                <div>
                  <div className="card-label">
                    DAILY FOCUS TARGET
                  </div>

                  <h3>{goal} minutes</h3>
                </div>

                <div className="goal-percent">
                  {goalProgress}%
                </div>
              </div>

              <div className="goal-track">
                <span
                  style={{
                    width: `${goalProgress}%`,
                  }}
                />
              </div>

              <div className="goal-footer">
                <span>
                  {Math.floor(totalTime / 60000)}
                  {" "}minutes completed
                </span>

                <span>
                  {Math.max(
                    0,
                    goal -
                      Math.floor(
                        totalTime / 60000
                      )
                  )}{" "}
                  minutes remaining
                </span>
              </div>

              <div className="goal-controls">
                {[60, 90, 120, 180].map(
                  (value) => (
                    <button
                      key={value}
                      className={
                        goal === value
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setGoal(value)
                      }
                    >
                      {value}m
                    </button>
                  )
                )}
              </div>
            </article>

            <article className="card insight-card reveal">
              <div className="card-label">
                FOCUSFLOW INSIGHT
              </div>

              <div className="insight-icon">
                ✦
              </div>

              <h3>
                {totalTime === 0
                  ? "Start browsing to unlock insights."
                  : productivityPercent >= 70
                  ? "You're spending most of your tracked time productively."
                  : "Your browsing pattern has room for a stronger focus block."}
              </h3>

              <p>
                FocusFlow turns your browsing
                activity into patterns that are
                easier to understand and act on.
              </p>
            </article>
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>
            FOCUSFLOW · PRODUCTIVITY OS
          </span>

          <span>
            Live MongoDB analytics
          </span>
        </footer>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  footer,
}) {
  return (
    <article className="card stat-card reveal">
      <div className="stat-icon">{icon}</div>

      <div className="card-label">
        {label}
      </div>

      <div className="stat-value">
        {value}
      </div>

      <div className="stat-footer">
        {footer}
      </div>
    </article>
  );
}

export default App;
