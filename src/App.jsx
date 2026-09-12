import { useEffect, useState } from "react";
import "./App.css";

const violationRules = {
  "red light": {
    type: "Red Light Violation",
    fine: 5000,
    severity: "Serious",
  },

  "over speed": {
    type: "Over Speeding",
    fine: 3000,
    severity: "Serious",
  },

  speeding: {
    type: "Over Speeding",
    fine: 3000,
    severity: "Serious",
  },

  "wrong parking": {
    type: "Wrong Parking",
    fine: 2000,
    severity: "Minor",
  },

  "no helmet": {
    type: "No Helmet",
    fine: 1500,
    severity: "Moderate",
  },

  "no seat belt": {
    type: "No Seat Belt",
    fine: 1500,
    severity: "Moderate",
  },

  "wrong way": {
    type: "Wrong Way",
    fine: 4000,
    severity: "Serious",
  },
};

function App() {
  const [input, setInput] = useState("");

  const [analysis, setAnalysis] = useState(null);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/violations")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load violation records.");
        }

        return response.json();
      })
      .then((data) => {
        setRecords(data);
        setRecordsLoading(false);
      })
      .catch((error) => {
        setRecordsError(error.message);
        setRecordsLoading(false);
      });

    const events = new EventSource("/api/events");
    events.addEventListener("violations", (event) => {
      setRecords(JSON.parse(event.data));
      setRecordsError("");
      setRecordsLoading(false);
    });

    events.onerror = () => {
      setRecordsError(
        "Live updates are unavailable. Check that the backend is running."
      );
      setRecordsLoading(false);
    };

    return () => events.close();
  }, []);

  // Search and filters
  const [searchVehicle, setSearchVehicle] =
    useState("");

  const [searchViolation, setSearchViolation] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  // Selected record for details
  const [selectedRecord, setSelectedRecord] =
    useState(null);

  // ==========================================
  // PARSER
  // ==========================================

  const parseViolation = () => {
    if (!input.trim()) {
      setAnalysis({
        error:
          "Please enter a traffic violation statement.",
      });

      return;
    }

    const text = input.trim();

    // Vehicle Number
    const vehicleRegex =
      /\b[A-Z]{2,4}-\d{3,5}\b/i;

    const vehicleMatch =
      text.match(vehicleRegex);

    const vehicleNumber = vehicleMatch
      ? vehicleMatch[0].toUpperCase()
      : null;

    // Speed
    const speedRegex =
      /(\d+)\s*(km\/h|kmh|km)/i;

    const speedMatch =
      text.match(speedRegex);

    const speed = speedMatch
      ? Number(speedMatch[1])
      : null;

    // Violation
    let detectedViolation = null;

    for (const keyword in violationRules) {
      if (
        text
          .toLowerCase()
          .includes(keyword)
      ) {
        detectedViolation =
          violationRules[keyword];

        break;
      }
    }

    // Location
    let location = null;

    const locationRegex =
      /(?:at|on|near)\s+(.+?)(?=\s+(?:at|on|near)\s+|\s+\d+\s*(?:km\/h|kmh|km)\b|$)/i;

    const locationMatch =
      text.match(locationRegex);

    if (locationMatch) {
      location =
        locationMatch[1].trim();
    }

    if (location) {
      location = location
        .replace(/\s+at\s*$/i, "")
        .replace(/\s+on\s*$/i, "")
        .trim();
    }

    // Tokens
    const tokens = [];

    if (vehicleNumber) {
      tokens.push({
        type: "VEHICLE_NUMBER",
        value: vehicleNumber,
      });
    }

    if (detectedViolation) {
      tokens.push({
        type: "VIOLATION",
        value:
          detectedViolation.type,
      });
    }

    if (speed !== null) {
      tokens.push({
        type: "SPEED",
        value: `${speed} km/h`,
      });
    }

    if (location) {
      tokens.push({
        type: "LOCATION",
        value: location,
      });
    }

    // Validation
    const errors = [];

    if (!vehicleNumber) {
      errors.push(
        "Vehicle number is missing or invalid."
      );
    }

    if (!detectedViolation) {
      errors.push(
        "Unknown traffic violation."
      );
    }

    if (!location) {
      errors.push(
        "Location is missing."
      );
    }

    if (speed !== null && speed < 0) {
      errors.push(
        "Speed cannot be negative."
      );
    }

    if (errors.length > 0) {
      setAnalysis({
        source: text,
        tokens,
        errors,
        parsing: "Warning",
      });

      return;
    }

    const result = {
      vehicleNumber,

      violation:
        detectedViolation.type,

      location,

      speed:
        speed !== null
          ? `${speed} km/h`
          : "Not provided",

      fine:
        detectedViolation.fine,

      severity:
        detectedViolation.severity,

      status: "Pending",

      dateTime:
        new Date().toLocaleString(),
    };

    setAnalysis({
      source: text,

      tokens,

      errors: [],

      parsing: "Successful",

      result,
    });
  };

  // ==========================================
  // SAVE
  // ==========================================

  const saveViolation = async () => {
    if (!analysis?.result) {
      return;
    }

    setSaveError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis.result),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "The server could not save this violation.");
      }

      alert("Violation saved successfully!");
    } catch (error) {
      setSaveError(
        error.message.includes("Failed to fetch")
          ? "Cannot connect to the backend. Start the app with npm run dev."
          : error.message
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // STATUS
  // ==========================================

  const toggleStatus = async (id) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;

    await fetch(`/api/violations/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: record.status === "Paid" ? "Pending" : "Paid",
      }),
    });
  };

  // ==========================================
  // DELETE
  // ==========================================

  const deleteRecord = async (id) => {
    await fetch(`/api/violations/${id}`, { method: "DELETE" });
  };

  // ==========================================
  // FILTER RECORDS
  // ==========================================

  const filteredRecords =
    records.filter((record) => {
      const vehicleMatch =
        record.vehicleNumber
          .toLowerCase()
          .includes(
            searchVehicle.toLowerCase()
          );

      const violationMatch =
        record.violation
          .toLowerCase()
          .includes(
            searchViolation.toLowerCase()
          );

      const statusMatch =
        statusFilter === "All"
          ? true
          : record.status ===
            statusFilter;

      return (
        vehicleMatch &&
        violationMatch &&
        statusMatch
      );
    });

  // ==========================================
  // DASHBOARD
  // ==========================================

  const totalViolations =
    records.length;

  const totalFines =
    records.reduce(
      (total, record) =>
        total + Number(record.fine),
      0
    );

  const pendingFines =
    records.filter(
      (record) =>
        record.status === "Pending"
    );

  const paidFines =
    records.filter(
      (record) =>
        record.status === "Paid"
    );

  const seriousViolations =
    records.filter(
      (record) =>
        record.severity === "Serious"
    );

  // ==========================================
  // MOST COMMON
  // ==========================================

  let mostCommonViolation =
    "None";

  if (records.length > 0) {
    const counts = {};

    records.forEach((record) => {
      counts[record.violation] =
        (counts[record.violation] ||
          0) + 1;
    });

    mostCommonViolation =
      Object.entries(counts).sort(
        (a, b) =>
          b[1] - a[1]
      )[0][0];
  }

  return (
    <div className="app">

      {/* NAVBAR */}

      <nav className="navbar">

        <div className="logo">
          🚦 Traffic
          <span>Guard</span>
        </div>

        <div className="nav-links">

          <a href="#home">
            Home
          </a>

          <a href="#parser">
            Parser
          </a>

          <a href="#records">
            Records
          </a>

          <a href="#dashboard">
            Dashboard
          </a>

        </div>

      </nav>

      {/* HERO */}

      <section
        className="hero"
        id="home"
      >

        <div className="hero-content">

          <div className="badge">
            Compiler Construction Project
          </div>

          <h1>
            Traffic Fine &
            <span>
              {" "}Violation Parser
            </span>
          </h1>

          <p>
            Analyze traffic violation
            statements using tokenization,
            parsing, validation and
            automated fine calculation.
          </p>

          <button
            className="primary-btn"
            onClick={() =>
              document
                .getElementById(
                  "parser"
                )
                .scrollIntoView({
                  behavior:
                    "smooth",
                })
            }
          >
            Start Parser →
          </button>

        </div>

      </section>

      {/* STATS */}

      <section className="stats">

        <div className="stat-card">

          <div className="stat-icon">
            📋
          </div>

          <div>

            <h3>
              {totalViolations}
            </h3>

            <p>
              Total Violations
            </p>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            💰
          </div>

          <div>

            <h3>
              Rs.{" "}
              {totalFines.toLocaleString()}
            </h3>

            <p>
              Total Fines
            </p>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            ⏳
          </div>

          <div>

            <h3>
              {pendingFines.length}
            </h3>

            <p>
              Pending Fines
            </p>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            ✓
          </div>

          <div>

            <h3>
              {paidFines.length}
            </h3>

            <p>
              Paid Fines
            </p>

          </div>

        </div>

      </section>

      {/* PARSER */}

      <section
        className="parser-section"
        id="parser"
      >

        <div className="section-heading">

          <p>
            TRAFFIC VIOLATION PARSER
          </p>

          <h2>
            Analyze Violation Statement
          </h2>

          <span>
            Enter a complete traffic
            violation sentence below.
          </span>

        </div>

        <div className="parser-box">

          <label>
            Source Input
          </label>

          <textarea
            value={input}
            onChange={(e) =>
              setInput(
                e.target.value
              )
            }
            placeholder="Example: Vehicle LEB-1234 crossed red light at Jail Road Lahore at 85 km/h"
          />

          <button
            className="parse-btn"
            onClick={
              parseViolation
            }
          >
            🔍 Analyze Statement
          </button>

          {/* PIPELINE */}

          <div className="pipeline">

            <div className="pipeline-item active">
              <strong>01</strong>
              <span>
                Source Input
              </span>
            </div>

            <div className="arrow">
              →
            </div>

            <div className="pipeline-item">
              <strong>02</strong>
              <span>
                Lexical Analysis
              </span>
            </div>

            <div className="arrow">
              →
            </div>

            <div className="pipeline-item">
              <strong>03</strong>
              <span>
                Syntax Parsing
              </span>
            </div>

            <div className="arrow">
              →
            </div>

            <div className="pipeline-item">
              <strong>04</strong>
              <span>
                Validation
              </span>
            </div>

            <div className="arrow">
              →
            </div>

            <div className="pipeline-item">
              <strong>05</strong>
              <span>
                Fine Calculation
              </span>
            </div>

          </div>

        </div>

        {/* ANALYSIS */}

        {analysis && (

          <div className="analysis">

            <div className="analysis-title">

              <div>

                <p>
                  PARSER ANALYSIS
                </p>

                <h2>
                  Compiler Processing
                </h2>

              </div>

              {analysis.parsing && (

                <div
                  className={
                    analysis.parsing ===
                    "Successful"
                      ? "success-badge"
                      : "warning-badge"
                  }
                >
                  {analysis.parsing ===
                  "Successful"
                    ? "✓ Parsing Successful"
                    : "⚠ Parsing Warning"}
                </div>

              )}

            </div>

            {/* SOURCE */}

            <div className="analysis-card">

              <h3>
                01. Source Input
              </h3>

              <div className="source-code">
                {analysis.source ||
                  input}
              </div>

            </div>

            {/* TOKENS */}

            <div className="analysis-card">

              <h3>
                02. Lexical Analysis —
                Tokens
              </h3>

              {analysis.tokens?.length >
              0 ? (

                <div className="token-grid">

                  {analysis.tokens.map(
                    (
                      token,
                      index
                    ) => (

                      <div
                        className="token"
                        key={index}
                      >

                        <span>
                          {token.type}
                        </span>

                        <strong>
                          {token.value}
                        </strong>

                      </div>

                    )
                  )}

                </div>

              ) : (

                <p className="muted">
                  No meaningful tokens
                  detected.
                </p>

              )}

            </div>

            {/* SYNTAX */}

            <div className="analysis-card">

              <h3>
                03. Syntax Parsing
              </h3>

              <div className="syntax-flow">

                <span>
                  Vehicle Number
                </span>

                <b>+</b>

                <span>
                  Violation
                </span>

                <b>+</b>

                <span>
                  Location
                </span>

                <b>+</b>

                <span>
                  Optional Speed
                </span>

              </div>

              <div
                className={
                  analysis.parsing ===
                  "Successful"
                    ? "parse-success"
                    : "parse-warning"
                }
              >

                {analysis.parsing ===
                "Successful"
                  ? "✓ Sentence structure is valid."
                  : "⚠ Sentence structure needs attention."}

              </div>

            </div>

            {/* ERRORS */}

            {analysis.errors?.length >
              0 && (

              <div className="error-card">

                <h3>
                  ⚠ Validation Errors
                </h3>

                {analysis.errors.map(
                  (
                    error,
                    index
                  ) => (

                    <p key={index}>
                      • {error}
                    </p>

                  )
                )}

              </div>

            )}

            {/* RESULT */}

            {analysis.result && (

              <div className="result-section">

                <div className="result-header">

                  <div>

                    <p>
                      FINAL OUTPUT
                    </p>

                    <h2>
                      Violation Record
                    </h2>

                  </div>

                  <span className="pending">
                    ● Pending
                  </span>

                </div>

                <div className="result-grid">

                  <div className="result-item">

                    <label>
                      Vehicle Number
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .vehicleNumber
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Violation Type
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .violation
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Location
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .location
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Speed
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .speed
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Fine Amount
                    </label>

                    <strong className="fine">
                      Rs.{" "}
                      {
                        analysis
                          .result
                          .fine
                          .toLocaleString()
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Severity
                    </label>

                    <strong className="severity">
                      {
                        analysis
                          .result
                          .severity
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Status
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .status
                      }
                    </strong>

                  </div>

                  <div className="result-item">

                    <label>
                      Date / Time
                    </label>

                    <strong>
                      {
                        analysis
                          .result
                          .dateTime
                      }
                    </strong>

                  </div>

                </div>

                <button
                  className="save-btn"
                  disabled={isSaving}
                  onClick={
                    saveViolation
                  }
                >
                  {isSaving
                    ? "Saving..."
                    : "💾 Save Violation"}
                </button>

                {saveError && (
                  <p className="save-error">
                    {saveError}
                  </p>
                )}

              </div>

            )}

          </div>

        )}

      </section>

      {/* =====================================
          RECORDS
      ===================================== */}

      <section
        className="records-section"
        id="records"
      >

        <div className="section-heading">

          <p>
            VIOLATION MANAGEMENT
          </p>

          <h2>
            Violation Records
          </h2>

          <span>
            Search, filter and manage
            traffic violations.
          </span>

        </div>

        <div className="records-card">

          {/* SEARCH AREA */}

          <div className="search-area">

            <div className="search-box">

              <label>
                Vehicle Number
              </label>

              <input
                type="text"
                placeholder="Search vehicle e.g. LEB-1234"
                value={
                  searchVehicle
                }
                onChange={(e) =>
                  setSearchVehicle(
                    e.target.value
                  )
                }
              />

            </div>

            <div className="search-box">

              <label>
                Violation
              </label>

              <input
                type="text"
                placeholder="Search violation"
                value={
                  searchViolation
                }
                onChange={(e) =>
                  setSearchViolation(
                    e.target.value
                  )
                }
              />

            </div>

            <div className="search-box">

              <label>
                Status
              </label>

              <select
                value={
                  statusFilter
                }
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value
                  )
                }
              >

                <option value="All">
                  All
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="Paid">
                  Paid
                </option>

              </select>

            </div>

          </div>

          {/* TABLE */}

          {recordsLoading ? (
            <div className="empty-records">
              <h3>Loading Records...</h3>
              <p>Connecting to the traffic records database.</p>
            </div>
          ) : recordsError ? (
            <div className="empty-records records-error">
              <h3>Records Unavailable</h3>
              <p>{recordsError}</p>
            </div>
          ) : filteredRecords.length ===
          0 ? (

            <div className="empty-records">

              <div>
                📋
              </div>

              <h3>
                No Records Found
              </h3>

              <p>
                Try another search or
                save a new violation.
              </p>

            </div>

          ) : (

            <div className="records-table">

              <div className="record-row record-header">

                <span>
                  Vehicle
                </span>

                <span>
                  Violation
                </span>

                <span>
                  Location
                </span>

                <span>
                  Fine
                </span>

                <span>
                  Status
                </span>

                <span>
                  Actions
                </span>

              </div>

              {filteredRecords.map(
                (record) => (

                  <div
                    className="record-row"
                    key={record.id}
                  >

                    <span>
                      <strong>
                        {
                          record.vehicleNumber
                        }
                      </strong>
                    </span>

                    <span>
                      {
                        record.violation
                      }
                    </span>

                    <span>
                      {
                        record.location
                      }
                    </span>

                    <span className="record-fine">
                      Rs.{" "}
                      {
                        record.fine
                          .toLocaleString()
                      }
                    </span>

                    <span>

                      <button
                        className={
                          record.status ===
                          "Paid"
                            ? "status-paid"
                            : "status-pending"
                        }
                        onClick={() =>
                          toggleStatus(
                            record.id
                          )
                        }
                      >

                        {
                          record.status
                        }

                      </button>

                    </span>

                    <span className="actions">

                      <button
                        className="view-btn"
                        onClick={() =>
                          setSelectedRecord(
                            record
                          )
                        }
                      >
                        View
                      </button>

                      <button
                        className="delete-btn"
                        onClick={() =>
                          deleteRecord(
                            record.id
                          )
                        }
                      >
                        Delete
                      </button>

                    </span>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </section>

      {/* =====================================
          DETAILS MODAL
      ===================================== */}

      {selectedRecord && (

        <div
          className="modal-overlay"
          onClick={() =>
            setSelectedRecord(null)
          }
        >

          <div
            className="details-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <p>
                  VIOLATION DETAILS
                </p>

                <h2>
                  Traffic Fine Record
                </h2>

              </div>

              <button
                className="close-btn"
                onClick={() =>
                  setSelectedRecord(
                    null
                  )
                }
              >
                ×
              </button>

            </div>

            <div className="details-grid">

              <div>
                <label>
                  Vehicle Number
                </label>

                <strong>
                  {
                    selectedRecord
                      .vehicleNumber
                  }
                </strong>
              </div>

              <div>
                <label>
                  Violation
                </label>

                <strong>
                  {
                    selectedRecord
                      .violation
                  }
                </strong>
              </div>

              <div>
                <label>
                  Location
                </label>

                <strong>
                  {
                    selectedRecord
                      .location
                  }
                </strong>
              </div>

              <div>
                <label>
                  Speed
                </label>

                <strong>
                  {
                    selectedRecord
                      .speed
                  }
                </strong>
              </div>

              <div>
                <label>
                  Fine Amount
                </label>

                <strong className="modal-fine">
                  Rs.{" "}
                  {
                    selectedRecord
                      .fine
                      .toLocaleString()
                  }
                </strong>
              </div>

              <div>
                <label>
                  Severity
                </label>

                <strong>
                  {
                    selectedRecord
                      .severity
                  }
                </strong>
              </div>

              <div>
                <label>
                  Status
                </label>

                <strong>
                  {
                    selectedRecord
                      .status
                  }
                </strong>
              </div>

              <div>
                <label>
                  Date / Time
                </label>

                <strong>
                  {
                    selectedRecord
                      .dateTime
                  }
                </strong>
              </div>

            </div>

            <button
              className="modal-close-btn"
              onClick={() =>
                setSelectedRecord(
                  null
                )
              }
            >
              Close
            </button>

          </div>

        </div>

      )}

      {/* =====================================
          DASHBOARD
      ===================================== */}

      <section
        className="dashboard-section"
        id="dashboard"
      >

        <div className="section-heading">

          <p>
            ANALYTICS
          </p>

          <h2>
            Traffic Dashboard
          </h2>

          <span>
            Overview of traffic
            violation records.
          </span>

        </div>

        <div className="dashboard-grid">

          <div className="dashboard-card">

            <span className="dashboard-icon">
              📋
            </span>

            <p>
              Total Violations
            </p>

            <h3>
              {totalViolations}
            </h3>

          </div>

          <div className="dashboard-card">

            <span className="dashboard-icon">
              💰
            </span>

            <p>
              Total Fine Amount
            </p>

            <h3>
              Rs.{" "}
              {
                totalFines
                  .toLocaleString()
              }
            </h3>

          </div>

          <div className="dashboard-card">

            <span className="dashboard-icon">
              ⏳
            </span>

            <p>
              Pending Fines
            </p>

            <h3>
              {
                pendingFines.length
              }
            </h3>

          </div>

          <div className="dashboard-card">

            <span className="dashboard-icon">
              ✓
            </span>

            <p>
              Paid Fines
            </p>

            <h3>
              {
                paidFines.length
              }
            </h3>

          </div>

          <div className="dashboard-card">

            <span className="dashboard-icon">
              🚨
            </span>

            <p>
              Serious Violations
            </p>

            <h3>
              {
                seriousViolations.length
              }
            </h3>

          </div>

          <div className="dashboard-card">

            <span className="dashboard-icon">
              📊
            </span>

            <p>
              Most Common Violation
            </p>

            <h3 className="common-violation">
              {
                mostCommonViolation
              }
            </h3>

          </div>

        </div>

      </section>

      {/* VIOLATION RULES */}

      <section className="violations">

        <div className="section-heading">

          <p>
            SUPPORTED VIOLATIONS
          </p>

          <h2>
            Fine & Severity Rules
          </h2>

        </div>

        <div className="violation-table">

          <div className="table-row table-header">

            <span>
              Violation
            </span>

            <span>
              Fine
            </span>

            <span>
              Severity
            </span>

          </div>

          {Object.values(
            violationRules
          ).map(
            (rule, index) => (

              <div
                className="table-row"
                key={index}
              >

                <span>
                  {rule.type}
                </span>

                <span>
                  Rs.{" "}
                  {
                    rule.fine
                      .toLocaleString()
                  }
                </span>

                <span
                  className={`severity-tag ${rule.severity.toLowerCase()}`}
                >
                  {
                    rule.severity
                  }
                </span>

              </div>

            )
          )}

        </div>

      </section>

      {/* FOOTER */}

      <footer>

        <div className="logo">
          🚦 Traffic
          <span>
            Guard
          </span>
        </div>

        <p>
          Traffic Fine & Violation
          Parser — Compiler
          Construction Project
        </p>

      </footer>

    </div>
  );
}

export default App;