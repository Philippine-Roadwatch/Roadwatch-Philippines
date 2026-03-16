const ADMIN_USERNAME = "roadwatchph";
const ADMIN_PASSWORD = "roadwatchph";
const ADMIN_SESSION_KEY = "roadwatchAdminAuthed";
const API_URL = "https://script.google.com/macros/s/AKfycbz5Z666xxZThJsMGwPCDNg8Vdku-WfQmZHeQHM6Rko4YLwnnpViqTAMX2UfBbUyk_u1/exec";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");

function parseReports(payload) {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];

    try {
      return parseReports(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.reports)) return payload.reports;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function setFeedback(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ffadb3" : "#9ce9ab";
}

function applyAuthUI() {
  const isAuthed = localStorage.getItem(ADMIN_SESSION_KEY) === "true";
  loginPanel.classList.toggle("hidden", isAuthed);
  dashboard.classList.toggle("hidden", !isAuthed);
  if (isAuthed) {
    loadReports();
  }
}

function login() {
  const username = document.getElementById("adminUsername").value.trim();
  const password = document.getElementById("adminPassword").value.trim();

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(ADMIN_SESSION_KEY, "true");
    setFeedback("loginFeedback", "Login successful.");
    applyAuthUI();
    return;
  }

  setFeedback("loginFeedback", "Invalid username or password.", true);
}

function logout() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  applyAuthUI();
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getFieldValue(record, aliases) {
  if (!record || typeof record !== "object") return "";

  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null) {
      return record[alias];
    }
  }

  const normalized = Object.keys(record).reduce((acc, key) => {
    acc[normalizeKey(key)] = record[key];
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = normalized[normalizeKey(alias)];
    if (value !== undefined && value !== null) return value;
  }

  return "";
}

function normalizeStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "verified") return "Verified";
  if (raw === "in progress" || raw === "inprogress") return "In Progress";
  if (raw === "repaired") return "Repaired";
  return "Pending";
}

function normalizeReport(record = {}) {
  return {
    tracking: getFieldValue(record, ["tracking", "trackingNumber", "tracking_no", "Tracking #", "Tracking Number"]),
    name: [
      getFieldValue(record, ["firstname", "firstName", "First Name"]),
      getFieldValue(record, ["lastname", "lastName", "Last Name"])
    ].filter(Boolean).join(" ") || getFieldValue(record, ["name", "fullName", "Reporter Name"]) || "-",
    location: getFieldValue(record, ["location", "address", "road", "Road Location"]) || "-",
    issue: getFieldValue(record, [
      "issue",
      "issueDetail",
      "issueDetails",
      "Issue",
      "Issue Detail",
      "Issue Details",
      "description",
      "details"
    ]) || "-",
    photo: getFieldValue(record, ["photo", "image", "photoUrl", "Photo"]) || "",
    status: normalizeStatus(getFieldValue(record, ["status", "reportStatus", "Status"]))
  };
}

async function updateReportStatus(tracking, status) {
  const body = new URLSearchParams({
    action: "updateStatus",
    tracking: String(tracking || "").trim(),
    status: status
  });

  const response = await fetch(API_URL, {
    method: "POST",
    body
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!payload.success) {
    throw new Error(payload.error || "Unable to update report status.");
  }

  return payload;
}

function statusSelect(current, tracking) {
  const select = document.createElement("select");
  ["Pending", "Verified", "In Progress", "Repaired"].forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    option.selected = current === label;
    select.appendChild(option);
  });

  select.addEventListener("change", async () => {
    const nextStatus = select.value;
    const previousStatus = select.dataset.previous || current;
    select.disabled = true;

    try {
      await updateReportStatus(tracking, nextStatus);
      select.dataset.previous = nextStatus;
      setFeedback("reportsFeedback", `Updated ${tracking} to ${nextStatus}.`);
      updateAnalyticsFromRows();
    } catch (error) {
      select.value = previousStatus;
      setFeedback("reportsFeedback", error.message || "Unable to save status update.", true);
    } finally {
      select.disabled = false;
    }
  });

  select.dataset.previous = current;
  return select;
}

function photoCell(photo) {
  if (!photo) return "-";
  const safeUrl = String(photo).trim();
  if (!safeUrl) return "-";

  const isImageData = safeUrl.startsWith("data:image");
  const isHttp = /^https?:\/\//i.test(safeUrl);
  if (!isImageData && !isHttp) return "Uploaded";

  const anchor = document.createElement("a");
  anchor.href = safeUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";

  const img = document.createElement("img");
  img.className = "reportPhotoThumb";
  img.src = safeUrl;
  img.alt = "Report photo";
  anchor.appendChild(img);

  return anchor;
}

function renderAnalytics(reports) {
  const counts = {
    total: reports.length,
    pending: 0,
    verified: 0,
    inProgress: 0,
    repaired: 0
  };

  reports.forEach((report) => {
    const normalized = normalizeStatus(report.status).toLowerCase();
    if (normalized === "pending") counts.pending += 1;
    if (normalized === "verified") counts.verified += 1;
    if (normalized === "in progress") counts.inProgress += 1;
    if (normalized === "repaired") counts.repaired += 1;
  });

  document.getElementById("totalReportsCount").textContent = counts.total;
  document.getElementById("pendingReportsCount").textContent = counts.pending;
  document.getElementById("verifiedReportsCount").textContent = counts.verified;
  document.getElementById("inProgressReportsCount").textContent = counts.inProgress;
  document.getElementById("repairedReportsCount").textContent = counts.repaired;
}

function updateAnalyticsFromRows() {
  const selects = Array.from(document.querySelectorAll("#reportsBody select"));
  const reports = selects.map((select) => ({ status: select.value }));
  renderAnalytics(reports);
}

async function loadReports() {
  const tbody = document.getElementById("reportsBody");
  tbody.innerHTML = '<tr><td colspan="6">Loading reports...</td></tr>';

  try {
    const response = await fetch(`${API_URL}?action=getReports`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const responseText = await response.text();
    let payload = {};

    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = responseText;
      }
    }

    const reports = parseReports(payload).map(normalizeReport);
    if (reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">No reports found.</td></tr>';
      renderAnalytics([]);
      return;
    }

    tbody.innerHTML = "";
    const renderedReports = [];

    reports.forEach((report) => {
      const tr = document.createElement("tr");
      const effectiveStatus = normalizeStatus(report.status);
      renderedReports.push({ ...report, status: effectiveStatus });

      tr.innerHTML = `
        <td>${report.tracking || "-"}</td>
        <td>${report.name}</td>
        <td>${report.location}</td>
        <td>${report.issue}</td>
        <td></td>
        <td></td>
      `;

      const photoElement = photoCell(report.photo);
      if (typeof photoElement === "string") {
        tr.children[4].textContent = photoElement;
      } else {
        tr.children[4].appendChild(photoElement);
      }

      tr.children[5].appendChild(statusSelect(effectiveStatus, report.tracking));
      tbody.appendChild(tr);
    });

    renderAnalytics(renderedReports);
    setFeedback("reportsFeedback", `Loaded ${reports.length} report(s).`);
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="6">Unable to load reports right now.</td></tr>';
    renderAnalytics([]);
    setFeedback("reportsFeedback", error.message, true);
  }
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("refreshReportsBtn").addEventListener("click", loadReports);

applyAuthUI();
