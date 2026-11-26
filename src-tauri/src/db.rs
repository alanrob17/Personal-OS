use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

const APP_ID: &str = "personal-os-dashboard";
const APP_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub app: String,
    pub version: u32,
    pub settings: SettingsData,
    pub data: AppData,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsData {
    pub theme: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub kanban: Vec<KanbanCard>,
    pub calendar: Vec<CalendarEvent>,
    pub subscriptions: Vec<Subscription>,
    pub goals: Vec<Goal>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanCard {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub priority: String,
    #[serde(default)]
    pub due_date: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub cost: f64,
    pub category: String,
    pub start_date: String,
    pub frequency: String,
    #[serde(default)]
    pub end_date: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub target: f64,
    pub current: f64,
    #[serde(default)]
    pub deadline: String,
}

pub fn open_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create database directory: {e}"))?;
        }
    }

    let conn =
        Connection::open(path).map_err(|e| format!("Failed to open SQLite database: {e}"))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| format!("Failed to configure SQLite pragmas: {e}"))?;

    init_schema(&conn)?;
    Ok(conn)
}

pub fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kanban_cards (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
            due_date TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'done')),
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cost REAL NOT NULL CHECK (cost >= 0),
            category TEXT NOT NULL,
            start_date TEXT NOT NULL,
            frequency TEXT NOT NULL CHECK (frequency IN ('Weekly', 'Monthly', 'Quarterly', 'Yearly')),
            end_date TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            target REAL NOT NULL CHECK (target > 0),
            current REAL NOT NULL CHECK (current >= 0),
            deadline TEXT NOT NULL DEFAULT ''
        );",
    )
    .map_err(|e| format!("Failed to initialize SQLite schema: {e}"))
}

pub fn load_state(conn: &Connection) -> Result<Option<PersistedState>, String> {
    let theme_opt: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'theme'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read theme setting: {e}"))?;

    let kanban = read_kanban_cards(conn)?;
    let calendar = read_calendar_events(conn)?;
    let subscriptions = read_subscriptions(conn)?;
    let goals = read_goals(conn)?;

    if theme_opt.is_none()
        && kanban.is_empty()
        && calendar.is_empty()
        && subscriptions.is_empty()
        && goals.is_empty()
    {
        return Ok(None);
    }

    let theme = match theme_opt.as_deref() {
        Some("dark") => "dark".to_string(),
        _ => "light".to_string(),
    };

    Ok(Some(PersistedState {
        app: APP_ID.to_string(),
        version: APP_VERSION,
        settings: SettingsData { theme },
        data: AppData {
            kanban,
            calendar,
            subscriptions,
            goals,
        },
    }))
}

pub fn save_state(conn: &mut Connection, state: &PersistedState) -> Result<(), String> {
    if state.settings.theme != "light" && state.settings.theme != "dark" {
        return Err("Invalid theme value; expected 'light' or 'dark'.".to_string());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin SQLite transaction: {e}"))?;

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('theme', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![state.settings.theme],
    )
    .map_err(|e| format!("Failed to save theme setting: {e}"))?;

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![APP_VERSION.to_string()],
    )
    .map_err(|e| format!("Failed to save schema version: {e}"))?;

    tx.execute("DELETE FROM kanban_cards", [])
        .map_err(|e| format!("Failed to clear kanban_cards: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO kanban_cards (id, title, notes, priority, due_date, status, position)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| format!("Failed to prepare kanban insert: {e}"))?;
        for (idx, card) in state.data.kanban.iter().enumerate() {
            stmt.execute(params![
                card.id,
                card.title,
                card.notes,
                card.priority,
                card.due_date,
                card.status,
                idx as i64
            ])
            .map_err(|e| format!("Failed to insert kanban card '{}': {e}", card.id))?;
        }
    }

    tx.execute("DELETE FROM calendar_events", [])
        .map_err(|e| format!("Failed to clear calendar_events: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO calendar_events (id, title, date, notes)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(|e| format!("Failed to prepare calendar insert: {e}"))?;
        for ev in &state.data.calendar {
            stmt.execute(params![ev.id, ev.title, ev.date, ev.notes])
                .map_err(|e| format!("Failed to insert calendar event '{}': {e}", ev.id))?;
        }
    }

    tx.execute("DELETE FROM subscriptions", [])
        .map_err(|e| format!("Failed to clear subscriptions: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO subscriptions (id, name, cost, category, start_date, frequency, end_date, notes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )
            .map_err(|e| format!("Failed to prepare subscription insert: {e}"))?;
        for sub in &state.data.subscriptions {
            stmt.execute(params![
                sub.id,
                sub.name,
                sub.cost,
                sub.category,
                sub.start_date,
                sub.frequency,
                sub.end_date,
                sub.notes
            ])
            .map_err(|e| format!("Failed to insert subscription '{}': {e}", sub.id))?;
        }
    }

    tx.execute("DELETE FROM goals", [])
        .map_err(|e| format!("Failed to clear goals: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO goals (id, title, target, current, deadline)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| format!("Failed to prepare goal insert: {e}"))?;
        for goal in &state.data.goals {
            stmt.execute(params![
                goal.id,
                goal.title,
                goal.target,
                goal.current,
                goal.deadline
            ])
            .map_err(|e| format!("Failed to insert goal '{}': {e}", goal.id))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit SQLite transaction: {e}"))
}

fn read_kanban_cards(conn: &Connection) -> Result<Vec<KanbanCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, notes, priority, due_date, status
             FROM kanban_cards
             ORDER BY position ASC",
        )
        .map_err(|e| format!("Failed to prepare kanban query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(KanbanCard {
                id: row.get(0)?,
                title: row.get(1)?,
                notes: row.get(2)?,
                priority: row.get(3)?,
                due_date: row.get(4)?,
                status: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query kanban_cards: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read kanban_cards row: {e}"))
}

fn read_calendar_events(conn: &Connection) -> Result<Vec<CalendarEvent>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, date, notes FROM calendar_events")
        .map_err(|e| format!("Failed to prepare calendar query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CalendarEvent {
                id: row.get(0)?,
                title: row.get(1)?,
                date: row.get(2)?,
                notes: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query calendar_events: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read calendar_events row: {e}"))
}

fn read_subscriptions(conn: &Connection) -> Result<Vec<Subscription>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, cost, category, start_date, frequency, end_date, notes
             FROM subscriptions",
        )
        .map_err(|e| format!("Failed to prepare subscriptions query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Subscription {
                id: row.get(0)?,
                name: row.get(1)?,
                cost: row.get(2)?,
                category: row.get(3)?,
                start_date: row.get(4)?,
                frequency: row.get(5)?,
                end_date: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query subscriptions: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read subscriptions row: {e}"))
}

fn read_goals(conn: &Connection) -> Result<Vec<Goal>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, target, current, deadline FROM goals")
        .map_err(|e| format!("Failed to prepare goals query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Goal {
                id: row.get(0)?,
                title: row.get(1)?,
                target: row.get(2)?,
                current: row.get(3)?,
                deadline: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query goals: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read goals row: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_state() -> PersistedState {
        PersistedState {
            app: APP_ID.to_string(),
            version: APP_VERSION,
            settings: SettingsData {
                theme: "dark".to_string(),
            },
            data: AppData {
                kanban: vec![
                    KanbanCard {
                        id: "k2".to_string(),
                        title: "Second item first".to_string(),
                        notes: "Keep exact order".to_string(),
                        priority: "high".to_string(),
                        due_date: "2026-12-01".to_string(),
                        status: "in-progress".to_string(),
                    },
                    KanbanCard {
                        id: "k1".to_string(),
                        title: "First item second".to_string(),
                        notes: "".to_string(),
                        priority: "low".to_string(),
                        due_date: "".to_string(),
                        status: "todo".to_string(),
                    },
                ],
                calendar: vec![CalendarEvent {
                    id: "c1".to_string(),
                    title: "Dentist".to_string(),
                    date: "2026-12-10".to_string(),
                    notes: "Morning".to_string(),
                }],
                subscriptions: vec![Subscription {
                    id: "s1".to_string(),
                    name: "Cloud Backup".to_string(),
                    cost: 9.99,
                    category: "Cloud Storage".to_string(),
                    start_date: "2026-01-15".to_string(),
                    frequency: "Monthly".to_string(),
                    end_date: "".to_string(),
                    notes: "Annual plan check".to_string(),
                }],
                goals: vec![Goal {
                    id: "g1".to_string(),
                    title: "Read 24 books".to_string(),
                    target: 24.0,
                    current: 11.5,
                    deadline: "2026-12-31".to_string(),
                }],
            },
        }
    }

    #[test]
    fn fresh_db_returns_none() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        assert_eq!(load_state(&conn).unwrap(), None);
    }

    #[test]
    fn round_trip_preserves_order_and_fields() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let expected = sample_state();
        save_state(&mut conn, &expected).unwrap();
        let actual = load_state(&conn).unwrap().expect("state should exist");
        assert_eq!(actual, expected);
    }

    #[test]
    fn subsequent_save_replaces_and_deletes_removed_items() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        save_state(&mut conn, &sample_state()).unwrap();

        let updated = PersistedState {
            app: APP_ID.to_string(),
            version: APP_VERSION,
            settings: SettingsData {
                theme: "light".to_string(),
            },
            data: AppData {
                kanban: vec![],
                calendar: vec![],
                subscriptions: vec![],
                goals: vec![Goal {
                    id: "g2".to_string(),
                    title: "Run 100 km".to_string(),
                    target: 100.0,
                    current: 25.0,
                    deadline: "".to_string(),
                }],
            },
        };

        save_state(&mut conn, &updated).unwrap();
        let actual = load_state(&conn).unwrap().unwrap();
        assert_eq!(actual, updated);
    }

    #[test]
    fn invalid_rows_fail_and_roll_back_atomically() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        let valid = sample_state();
        save_state(&mut conn, &valid).unwrap();

        let mut bad_priority = valid.clone();
        bad_priority.data.kanban[0].priority = "urgent".to_string();
        assert!(save_state(&mut conn, &bad_priority).is_err());
        assert_eq!(load_state(&conn).unwrap().unwrap(), valid);

        let mut bad_status = valid.clone();
        bad_status.data.kanban[0].status = "archived".to_string();
        assert!(save_state(&mut conn, &bad_status).is_err());
        assert_eq!(load_state(&conn).unwrap().unwrap(), valid);

        let mut bad_cost = valid.clone();
        bad_cost.data.subscriptions[0].cost = -5.0;
        assert!(save_state(&mut conn, &bad_cost).is_err());
        assert_eq!(load_state(&conn).unwrap().unwrap(), valid);
    }

    #[test]
    fn file_backed_open_database_creates_file_and_enables_wal() {
        let temp_dir = std::env::temp_dir().join(format!(
            "personal_os_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db_path = temp_dir.join("nested").join("personal-os.db");

        let mut conn = open_database(&db_path).unwrap();
        assert!(db_path.exists());

        let mode: String = conn
            .query_row("PRAGMA journal_mode;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");

        save_state(&mut conn, &sample_state()).unwrap();
        assert!(load_state(&conn).unwrap().is_some());

        drop(conn);
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
