const ADMIN_USERNAME = "roadwatchph";
const ADMIN_PASSWORD = "roadwatchph";
const ADMIN_SESSION_KEY = "roadwatchAdminAuthed";
const STATUS_OVERRIDES_KEY = "roadwatchAdminStatusOverrides";
const SITE_SETTINGS_KEY = "roadwatchSiteSettings";
const API_URL = "https://script.google.com/macros/s/AKfycbz5Z666xxZThJsMGwPCDNg8Vdku-WfQmZHeQHM6Rko4YLwnnpViqTAMX2UfBbUyk_u1/exec";

const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");

function getStatusOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStatusOverrides(overrides) {
  localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
}

function parseReports(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.reports)) return payload.reports;
  if (payload && Array.isArray(payload.data)) return payload.data;
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
    loadSettings();
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

function getSiteSettings() {
  try {
    return JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadSettings() {
  const settings = getSiteSettings();
  document.getElementById("heroSubheaderInput").value = settings.heroSubheader || "";
  document.getElementById("heroPurposeInput").value = settings.heroPurpose || "";
  document.getElementById("liveStatusesInput").value = Array.isArray(settings.liveStatuses)
    ? settings.liveStatuses.join("\n")
    : "";
}

function saveSettings() {
  const heroSubheader = document.getElementById("heroSubheaderInput").value.trim();
  const heroPurpose = document.getElementById("heroPurposeInput").value.trim();
  const liveStatuses = document.getElementById("liveStatusesInput").value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify({ heroSubheader, heroPurpose, liveStatuses }));
  setFeedback("settingsFeedback", "Site settings saved. Refresh homepage to view changes.");
}

function normalizeReport(record = {}) {
  return {
    tracking: record.tracking || record.trackingNumber || "",
    name: [record.firstname || record.firstName, record.lastname || record.lastName].filter(Boolean).join(" ") || record.name || "-",
    location: record.location || "-",
    issue: record.issue || record.issueDetails || "-",
    status: record.status || "Pending"
  };
}

function statusSelect(current, tracking) {
  const select = document.createElement("select");
  ["Pending", "In Progress", "Repaired"].forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    option.selected = current === label;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    const overrides = getStatusOverrides();
    overrides[tracking] = select.value;
    saveStatusOverrides(overrides);
    setFeedback("reportsFeedback", `Saved status update for ${tracking}.`);
  });

  return select;
}

async function loadReports() {
  const tbody = document.getElementById("reportsBody");
  tbody.innerHTML = '<tr><td colspan="5">Loading reports...</td></tr>';

  try {
    const response = await fetch(`${API_URL}?action=getReports`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    const reports = parseReports(payload).map(normalizeReport);
    const overrides = getStatusOverrides();

    if (reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No reports found.</td></tr>';
      return;
    }

    tbody.innerHTML = "";
    reports.forEach((report) => {
      const tr = document.createElement("tr");
      const effectiveStatus = overrides[report.tracking] || report.status;

      tr.innerHTML = `
        <td>${report.tracking || "-"}</td>
        <td>${report.name}</td>
        <td>${report.location}</td>
        <td>${report.issue}</td>
        <td></td>
      `;

      tr.children[4].appendChild(statusSelect(effectiveStatus, report.tracking));
      tbody.appendChild(tr);
    });

    setFeedback("reportsFeedback", `Loaded ${reports.length} report(s).`);
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5">Unable to load reports right now.</td></tr>';
    setFeedback("reportsFeedback", error.message, true);
  }
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
document.getElementById("refreshReportsBtn").addEventListener("click", loadReports);

applyAuthUI();
