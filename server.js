require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const {
  AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE = "Jornadas",
  APP_KEY, ADMIN_KEY, PORT = 3000
} = process.env;

const TABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
  "Content-Type": "application/json"
});

function requireKey(kind) {
  return (req, res, next) => {
    const expected = kind === "admin" ? ADMIN_KEY : APP_KEY;
    const supplied = req.get("x-app-key");
    if (!expected || supplied !== expected) return res.status(401).json({ error: "Acceso no autorizado." });
    next();
  };
}

async function airtable(pathname = "", options = {}) {
  const response = await fetch(`${TABLE_URL}${pathname}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json();
 if (!response.ok) {
  console.error("Error detallado de Airtable:", response.status, JSON.stringify(data));
  throw new Error(`Airtable ${response.status}: ${data.error?.message || data.error?.type || JSON.stringify(data.error)}`);
}
  return data;
}

async function allNaomiRecords() {
  let records = [], offset;
  do {
    const params = new URLSearchParams({
      filterByFormula: "{Persona}='Naomi'",
      pageSize: "100",
      "sort[0][field]": "Entrada",
      "sort[0][direction]": "desc"
    });
    if (offset) params.set("offset", offset);
    const data = await airtable(`?${params.toString()}`);
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return records;
}

function overlapMs(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

// Divide cada jornada por día calendario. Horario nocturno: 19:00 a 09:00.
function summarize(records) {
  const days = {};
  for (const record of records) {
    const start = record.fields.Entrada ? new Date(record.fields.Entrada) : null;
    const end = record.fields.Salida ? new Date(record.fields.Salida) : null;
    if (!start || !end || end <= start) continue;
    let cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < end) {
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const segmentStart = Math.max(start.getTime(), dayStart.getTime());
      const segmentEnd = Math.min(end.getTime(), dayEnd.getTime());
      if (segmentEnd > segmentStart) {
        const nightMorningEnd = new Date(dayStart); nightMorningEnd.setHours(9, 0, 0, 0);
        const nightEveningStart = new Date(dayStart); nightEveningStart.setHours(19, 0, 0, 0);
        const night = overlapMs(segmentStart, segmentEnd, dayStart.getTime(), nightMorningEnd.getTime())
          + overlapMs(segmentStart, segmentEnd, nightEveningStart.getTime(), dayEnd.getTime());
        const total = segmentEnd - segmentStart;
        const key = [
          dayStart.getFullYear(),
          String(dayStart.getMonth() + 1).padStart(2, "0"),
          String(dayStart.getDate()).padStart(2, "0")
        ].join("-");
        if (!days[key]) days[key] = { date: key, nocturnasMs: 0, diurnasMs: 0, totalMs: 0 };
        days[key].nocturnasMs += night;
        days[key].diurnasMs += total - night;
        days[key].totalMs += total;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return days;
}

function isoNow() { return new Date().toISOString(); }

app.get("/api/status", requireKey("user"), async (req, res) => {
  try {
    const records = await allNaomiRecords();
    const open = records.find(r => r.fields.Estado === "Abierta" && r.fields.Entrada && !r.fields.Salida);
    res.json({ openShift: open ? {
      id: open.id, entrada: open.fields.Entrada
    } : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/history", requireKey("user"), async (req, res) => {
  try {
    const records = await allNaomiRecords();
    const open = records.find(r => r.fields.Estado === "Abierta" && r.fields.Entrada && !r.fields.Salida);
    res.json({
      records: records.map(r => ({
        id: r.id, entrada: r.fields.Entrada || null, salida: r.fields.Salida || null,
        estado: r.fields.Estado || "", tipo: r.fields["Tipo de registro"] || "",
        observaciones: r.fields["Motivo / observaciones"] || ""
      })),
      days: summarize(records),
      openShift: open ? { id: open.id, entrada: open.fields.Entrada } : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/clock/in", requireKey("user"), async (req, res) => {
  try {
    const records = await allNaomiRecords();
    if (records.some(r => r.fields.Estado === "Abierta" && r.fields.Entrada && !r.fields.Salida))
      return res.status(409).json({ error: "Ya hay una jornada abierta. Primero tenés que fichar la salida." });
    const now = isoNow();
    const created = await airtable("", {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: {
        "Registro": `Naomi - ${now}`,
        "Persona": "Naomi",
        "Entrada": now,
        "Estado": "Abierta",
        "Tipo de registro": "Fichaje original",
        "Última modificación": now
      }}] })
    });
    res.json({ ok: true, record: created.records[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/clock/out", requireKey("user"), async (req, res) => {
  try {
    const records = await allNaomiRecords();
    const open = records.find(r => r.fields.Estado === "Abierta" && r.fields.Entrada && !r.fields.Salida);
    if (!open) return res.status(409).json({ error: "No hay una jornada abierta para cerrar." });
    const now = isoNow();
    const updated = await airtable(`/${open.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: {
        "Salida": now, "Estado": "Cerrada", "Última modificación": now
      }})
    });
    res.json({ ok: true, record: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Vista administrativa: historial completo y correcciones gestionadas por RRHH.
app.get("/api/admin/history", requireKey("admin"), async (req, res) => {
  try {
    const records = await allNaomiRecords();
    res.json({ records: records.map(r => ({
      id: r.id, entrada: r.fields.Entrada || "", salida: r.fields.Salida || "",
      estado: r.fields.Estado || "", tipo: r.fields["Tipo de registro"] || "",
      observaciones: r.fields["Motivo / observaciones"] || ""
    })), days: summarize(records) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/admin/records/:id", requireKey("admin"), async (req, res) => {
  try {
    const { entrada, salida, motivo } = req.body || {};
    if (!entrada || !salida || !motivo || new Date(salida) <= new Date(entrada))
      return res.status(400).json({ error: "Ingresá entrada, salida y motivo. La salida debe ser posterior a la entrada." });
    const updated = await airtable(`/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: {
        "Entrada": new Date(entrada).toISOString(),
        "Salida": new Date(salida).toISOString(),
        "Estado": "Corregida",
        "Tipo de registro": "Corrección",
        "Motivo / observaciones": motivo,
        "Última modificación": isoNow()
      }})
    });
    res.json({ ok: true, record: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/:key", (req, res) => {
  if (req.params.key === APP_KEY || req.params.key === ADMIN_KEY) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  res.status(404).send("Enlace no válido.");
});

app.get("/", (req, res) => res.status(404).send("Usá el enlace privado que te proporcionó RRHH."));
app.listen(PORT, () => console.log(`Fichadas Naomi escuchando en puerto ${PORT}`));
