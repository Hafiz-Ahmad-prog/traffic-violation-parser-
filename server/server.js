import cors from "cors";
import Database from "better-sqlite3";
import express from "express";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(__dirname, "data");
mkdirSync(dataDirectory, { recursive: true });

const database = new Database(join(dataDirectory, "traffic.sqlite"));
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT NOT NULL,
    violation TEXT NOT NULL,
    location TEXT NOT NULL,
    speed TEXT NOT NULL,
    fine INTEGER NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    date_time TEXT NOT NULL
  )
`);

const app = express();
const clients = new Set();

app.use(cors());
app.use(express.json());

const toRecord = (row) => ({
  id: row.id,
  vehicleNumber: row.vehicle_number,
  violation: row.violation,
  location: row.location,
  speed: row.speed,
  fine: row.fine,
  severity: row.severity,
  status: row.status,
  dateTime: row.date_time,
});

const allRecords = () => database
  .prepare("SELECT * FROM violations ORDER BY id DESC")
  .all()
  .map(toRecord);

const broadcast = (event, records = allRecords()) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(records)}\n\n`;
  clients.forEach((client) => client.write(message));
};

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/violations", (_request, response) => {
  response.json(allRecords());
});

app.post("/api/violations", (request, response) => {
  const {
    vehicleNumber,
    violation,
    location,
    speed = "Not provided",
    fine,
    severity,
    status = "Pending",
    dateTime = new Date().toLocaleString(),
  } = request.body;

  if (!vehicleNumber || !violation || !location || !severity || !Number.isFinite(Number(fine))) {
    response.status(400).json({ error: "A complete violation record is required." });
    return;
  }

  const result = database.prepare(`
    INSERT INTO violations
      (vehicle_number, violation, location, speed, fine, severity, status, date_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicleNumber, violation, location, speed, Number(fine), severity, status, dateTime);

  const record = toRecord(database.prepare("SELECT * FROM violations WHERE id = ?").get(result.lastInsertRowid));
  broadcast("violations");
  response.status(201).json(record);
});

app.patch("/api/violations/:id/status", (request, response) => {
  const status = request.body.status;
  if (status !== "Paid" && status !== "Pending") {
    response.status(400).json({ error: "Status must be Paid or Pending." });
    return;
  }

  const result = database.prepare("UPDATE violations SET status = ? WHERE id = ?").run(status, request.params.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Violation not found." });
    return;
  }

  broadcast("violations");
  response.json(toRecord(database.prepare("SELECT * FROM violations WHERE id = ?").get(request.params.id)));
});

app.delete("/api/violations/:id", (request, response) => {
  const result = database.prepare("DELETE FROM violations WHERE id = ?").run(request.params.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Violation not found." });
    return;
  }

  broadcast("violations");
  response.status(204).end();
});

app.get("/api/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write(`event: violations\ndata: ${JSON.stringify(allRecords())}\n\n`);
  clients.add(response);
  request.on("close", () => clients.delete(response));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Traffic Guard API listening on port ${PORT}`);
});