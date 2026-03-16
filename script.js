let map;
let marker;
let lat = 0;
let lng = 0;
let cachedReports = [];
let corsFailureAlreadyLogged = false;
let corsRetryBlockedUntil = 0;
let isSubmittingReport = false;

const CORS_RETRY_COOLDOWN_MS = 60 * 1000;
const LOCAL_REPORTS_KEY = "roadwatchLocalReports";

const API_URL = "https://script.google.com/macros/s/AKfycbz5Z666xxZThJsMGwPCDNg8Vdku-WfQmZHeQHM6Rko4YLwnnpViqTAMX2UfBbUyk_u1/exec";


function getReportEndpoints() {
  // Keep a short endpoint list to avoid spamming repeated browser CORS errors
  // when the Apps Script deployment is not configured for cross-origin access.
  return [API_URL, `${API_URL}?action=getReports`];
}

function buildTrackingLookupEndpoints(trackingNumber) {
  const tracking = encodeURIComponent((trackingNumber || "").trim());
  return [
    `${API_URL}?action=getReportByTracking&tracking=${tracking}`,
    `${API_URL}?action=getReports`
  ];
}

function getLocalReports() {
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toReportModel);
  } catch (error) {
    console.warn("Unable to read local reports cache", error);
    return [];
  }
}

function saveLocalReports(reports) {
  try {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports));
  } catch (error) {
    console.warn("Unable to persist local reports cache", error);
  }
}

function mergeReportsByTracking(primaryReports, secondaryReports) {
  const merged = [];
  const indexByTracking = new Map();

  const append = (report) => {
    const normalizedReport = toReportModel(report);
    const trackingKey = (normalizedReport.tracking || "").toString().trim().toLowerCase();

    if (!trackingKey) {
      merged.push(normalizedReport);
      return;
    }

    if (indexByTracking.has(trackingKey)) {
      merged[indexByTracking.get(trackingKey)] = {
        ...merged[indexByTracking.get(trackingKey)],
        ...normalizedReport
      };
      return;
    }

    indexByTracking.set(trackingKey, merged.length);
    merged.push(normalizedReport);
  };

  (Array.isArray(primaryReports) ? primaryReports : []).forEach(append);
  (Array.isArray(secondaryReports) ? secondaryReports : []).forEach(append);

  return merged;
}

function cacheLocalSubmission(reportPayload) {
  const localReports = getLocalReports();
  const cachedEntry = {
    ...reportPayload,
    status: "Pending",
    timestamp: new Date().toISOString()
  };

  const mergedReports = mergeReportsByTracking([cachedEntry], localReports);
  saveLocalReports(mergedReports);
}

function getCurrentOrigin() {
  return window.location.origin || "this site";
}

function buildCorsErrorMessage(endpoint = API_URL) {
  const currentOrigin = getCurrentOrigin();
  return `Request to ${endpoint} was blocked by CORS from ${currentOrigin}. Redeploy the Google Apps Script web app with access set to Anyone, and return Access-Control-Allow-Origin for ${currentOrigin} (or *) on GET/POST and OPTIONS responses.`;
}

function isCorsRetryCooldownActive() {
  return Date.now() < corsRetryBlockedUntil;
}

function activateCorsRetryCooldown() {
  corsRetryBlockedUntil = Date.now() + CORS_RETRY_COOLDOWN_MS;
}

function isCorsConfigurationIssue(error) {
  return Boolean(error?.message && error.message.includes("Request blocked by CORS"));
}

function reportCorsTroubleshootingContext() {
  if (corsFailureAlreadyLogged) return;

  console.info(
    [
      "Google Apps Script CORS troubleshooting:",
      "1) Open Apps Script > Deploy > Manage deployments.",
      "2) Ensure the Web app is deployed with 'Who has access' set to 'Anyone'.",
      "   Also set 'Execute as' to your script owner account.",
      `   Current requesting origin: ${getCurrentOrigin()}.`,
      "3) Create a new Web app version after every Code.gs change, then update script.js with that latest /exec URL.",
      "4) Keep requests as simple GET/POST calls (avoid custom headers that trigger preflight).",
      "5) If there is still no Access-Control-Allow-Origin header, the issue is deployment-side (Apps Script), not this static frontend."
    ].join("\n")
  );

  corsFailureAlreadyLogged = true;
}

function buildNetworkErrorMessage() {
  return "Unable to reach the report API. Check your internet connection and verify the Google Apps Script /exec URL is still active.";
}

function readPhotoAsDataUrl() {
  const photoInput = document.getElementById("photo");
  const file = photoInput?.files?.[0];

  if (!file) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read the selected photo."));
    reader.readAsDataURL(file);
  });
}

function toUserFacingLoadErrorMessage(error) {
  if (!error?.message) return "Unable to load reports right now.";
  if (isCorsConfigurationIssue(error)) {
    return "Reports are temporarily unavailable because the Google Apps Script deployment is not allowing this website origin (CORS).";
  }
  return error.message;
}

function isLikelyCorsBlockedRequest(endpoint, error) {
  if (!(error instanceof TypeError)) return false;

  try {
    const endpointOrigin = new URL(endpoint).origin;
    return endpointOrigin !== window.location.origin;
  } catch {
    return false;
  }
}

function normalizeKey(key) {
  return (key || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeHtml(value) {
  return (value || "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function toReportModel(report) {
  return {
    tracking: getFieldValue(report, ["tracking", "trackingNumber", "tracking_no", "Tracking Number", "Tracking #", "Reference Number"]),
    name: getFieldValue(report, ["name", "fullName", "Full Name", "Reporter Name"]),
    lastname: getFieldValue(report, ["lastname", "lastName", "surname", "Last Name"]),
    firstname: getFieldValue(report, ["firstname", "firstName", "givenName", "First Name"]),
    mi: getFieldValue(report, ["mi", "middleinitial", "middleInitial", "Middle Initial"]),
    location: getFieldValue(report, ["location", "address", "road", "Road Location"]),
    issue: getFieldValue(report, [
      "issue",
      "issueDetail",
      "issueDetails",
      "issue_detail",
      "issue_details",
      "issueType",
      "issue_type",
      "problem",
      "details",
      "description",
      "concern",
      "Issue",
      "Issue Detail",
      "Issue Details",
      "Issue Type",
      "Details",
      "Report Detail",
      "Report Details"
    ]),
    status: getFieldValue(report, ["status", "reportStatus", "Status"]),
    lat: getFieldValue(report, ["lat", "latitude", "Latitude"]),
    lng: getFieldValue(report, ["lng", "lon", "longitude", "Longitude"]),
    timestamp: getFieldValue(report, ["timestamp", "time", "submittedAt", "submissionTime", "Submission Time", "date", "createdAt", "Submitted At"])
  };
}

function parseReportsFromApi(payload) {
  if (typeof payload === "string") {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) return [];

    try {
      return parseReportsFromApi(JSON.parse(trimmedPayload));
    } catch (error) {
      console.warn("Unable to parse string payload from API", error);
      return [];
    }
  }

  if (Array.isArray(payload)) return payload.map(toReportModel);

  if (payload && typeof payload === "object") {
    const possibleCollections = [payload.data, payload.reports, payload.items, payload.rows];
    const collection = possibleCollections.find(Array.isArray);
    if (collection) return collection.map(toReportModel);
  }

  return [];
}

async function fetchReports() {
  const localReports = getLocalReports();

  if (isCorsRetryCooldownActive()) {
    if (localReports.length > 0) return localReports;
    throw new Error(buildCorsErrorMessage(API_URL));
  }

  const sheetEndpoints = getReportEndpoints();

  let lastError;
  let corsBlocked = false;
  let corsBlockedEndpoint = "";

  for (const endpoint of sheetEndpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const responseText = await response.text();
      let payload = [];

      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch (parseError) {
          // Some Apps Script deployments return JSON as a serialized string.
          payload = responseText;
        }
      }

      const parsedReports = parseReportsFromApi(payload);

      if (parsedReports.length > 0) {
        cachedReports = mergeReportsByTracking(parsedReports, localReports);
        return cachedReports;
      }
    } catch (error) {
      if (isLikelyCorsBlockedRequest(endpoint, error)) {
        corsBlocked = true;
        corsBlockedEndpoint = endpoint;
        break;
      }
      lastError = error;
    }
  }

  cachedReports = [];
  if (corsBlocked) {
    if (localReports.length > 0) {
      cachedReports = localReports;
      return cachedReports;
    }
    activateCorsRetryCooldown();
    const corsError = new Error(buildCorsErrorMessage(corsBlockedEndpoint));
    reportCorsTroubleshootingContext();
    throw corsError;
  }
  if (lastError instanceof TypeError) {
    if (localReports.length > 0) {
      cachedReports = localReports;
      return cachedReports;
    }
    throw new Error(buildNetworkErrorMessage());
  }
  if (lastError) throw lastError;
  cachedReports = localReports;
  return cachedReports;
}

// Sidebar toggle
function isMenuOpen() {
  return document.getElementById("menu")?.classList.contains("open") || false;
}

function openMenu() {
  const menu = document.getElementById("menu");
  const menuBtn = document.getElementById("menuBtn");
  if (!menu) return;
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");
  menuBtn?.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  const menu = document.getElementById("menu");
  const menuBtn = document.getElementById("menuBtn");
  if (!menu) return;

  if (menu.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  menu.classList.remove("open");
  menu.setAttribute("aria-hidden", "true");
  menuBtn?.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (isMenuOpen()) {
    closeMenu();
    return;
  }

  openMenu();
}

// Show specific page/section
function showPage(page) {
  document.querySelectorAll("section").forEach(sec => sec.classList.remove("active"));
  const selectedPage = document.getElementById(page);
  if (!selectedPage) return;
  selectedPage.classList.add("active");
  closeMenu();

  if (page === "submit") {
    setTimeout(loadMap, 300);
  }
}


function resolveInitialPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("page");
  const hashPage = window.location.hash.replace("#", "");
  if (requestedPage === "submit" || hashPage === "submit") return "submit";
  return "home";
}

// Initialize the map
function loadMap() {
  if (map) return;

  map = L.map('reportMap').setView([14.5995, 120.9842], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  map.on("click", function (e) {
    lat = e.latlng.lat;
    lng = e.latlng.lng;

    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);

    document.getElementById("selectedLocation").innerText =
      "Selected: " + lat.toFixed(5) + " , " + lng.toFixed(5);
  });

}

// Auto-detect user location
async function detectLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  if (!map) {
    loadMap();
  }

  navigator.geolocation.getCurrentPosition(async function (pos) {
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;

    map.setView([lat, lng], 16);

    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);

    document.getElementById("selectedLocation").innerText =
      "Selected: " + lat.toFixed(5) + " , " + lng.toFixed(5);

    try {
      let response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      let data = await response.json();
      let road = data.address?.road || data.display_name;
      const locationInput = document.getElementById("locationText");
      if (locationInput) {
        locationInput.value = road || "";
      }
    } catch (error) {
      console.log("Reverse geocoding failed", error);
    }
  }, function () {
    alert("Unable to detect location. Please allow GPS permission or place a pin manually.");
  });
}


function normalizeStatus(status) {
  const rawStatus = (status || "Pending").toString().trim();
  const normalized = rawStatus.toLowerCase();
  const allowedStatuses = ["pending", "verified", "in progress", "repaired"];
  if (!allowedStatuses.includes(normalized)) return "Pending";
  return normalized.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatSubmissionTime(report) {
  const rawTime = getFieldValue(report, ["timestamp", "time", "submittedAt", "submissionTime", "Submission Time", "date", "createdAt", "Submitted At"]);
  if (!rawTime) return "Not available";

  const parsed = new Date(rawTime);
  if (Number.isNaN(parsed.getTime())) return String(rawTime);

  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getIssueCategory(issueText) {
  const issue = (issueText || "").toString().trim().toLowerCase();
  if (!issue) return "Unspecified";

  const issueMatchers = [
    { label: "Road Surface", patterns: ["pothole", "crack", "lane", "marking", "surface", "asphalt"] },
    { label: "Flooding & Drainage", patterns: ["flood", "drain", "water", "clog", "rain"] },
    { label: "Road Safety", patterns: ["traffic light", "sign", "guardrail", "crossing", "safety"] },
    { label: "Street Infrastructure", patterns: ["streetlight", "sidewalk", "manhole", "reflector", "pavement"] },
    { label: "Road Obstruction", patterns: ["obstruction", "fallen tree", "debris", "construction", "illegal parking", "blocked"] }
  ];

  const matched = issueMatchers.find(item => item.patterns.some(pattern => issue.includes(pattern)));
  if (matched) return matched.label;

  return "Other Concerns";
}

function computeReportStatistics(reports) {
  const safeReports = Array.isArray(reports) ? reports : [];

  const statusCounts = {
    pending: 0,
    inProgress: 0,
    repaired: 0
  };

  const issueTypeCounts = {};
  let thisMonthCount = 0;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  safeReports.forEach((report) => {
    const status = normalizeStatus(report.status).toLowerCase();
    if (status === "pending") statusCounts.pending += 1;
    if (status === "in progress") statusCounts.inProgress += 1;
    if (status === "repaired") statusCounts.repaired += 1;

    const issueType = getIssueCategory(report.issue);
    issueTypeCounts[issueType] = (issueTypeCounts[issueType] || 0) + 1;

    const rawDate = getFieldValue(report, ["timestamp", "time", "submittedAt", "submissionTime", "Submission Time", "date", "createdAt", "Submitted At"]);
    const parsedDate = new Date(rawDate);
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getMonth() === currentMonth && parsedDate.getFullYear() === currentYear) {
      thisMonthCount += 1;
    }
  });

  const topIssue = Object.entries(issueTypeCounts)
    .sort((a, b) => b[1] - a[1])[0] || ["None yet", 0];

  return {
    total: safeReports.length,
    statusCounts,
    issueTypeCounts,
    topIssue,
    thisMonthCount
  };
}

function buildDisplayNameForFixedRoad(report) {
  const location = (report.location || "").toString().trim() || "Location not provided";
  const issue = (report.issue || "").toString().trim() || "Issue repaired";
  return `${location} – ${issue}`;
}

function renderReportStatistics(reports) {
  const totalEl = document.getElementById("statsTotalReports");
  const pendingEl = document.getElementById("statsPending");
  const inProgressEl = document.getElementById("statsInProgress");
  const repairedEl = document.getElementById("statsRepaired");
  const recentFixedEl = document.getElementById("recentlyFixedRoads");
  const feedbackEl = document.getElementById("statsFeedback");

  if (!totalEl || !pendingEl || !inProgressEl || !repairedEl || !recentFixedEl || !feedbackEl) return;

  const stats = computeReportStatistics(reports);

  totalEl.textContent = stats.total.toLocaleString("en-PH");
  pendingEl.textContent = stats.statusCounts.pending.toLocaleString("en-PH");
  inProgressEl.textContent = stats.statusCounts.inProgress.toLocaleString("en-PH");
  repairedEl.textContent = stats.statusCounts.repaired.toLocaleString("en-PH");

  const recentlyFixed = [...(Array.isArray(reports) ? reports : [])]
    .filter((report) => normalizeStatus(report.status).toLowerCase() === "repaired")
    .sort((a, b) => {
      const timeA = new Date(getFieldValue(a, ["timestamp", "time", "submittedAt", "submissionTime", "Submission Time", "date", "createdAt", "Submitted At"]))?.getTime() || 0;
      const timeB = new Date(getFieldValue(b, ["timestamp", "time", "submittedAt", "submissionTime", "Submission Time", "date", "createdAt", "Submitted At"]))?.getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, 3);

  if (recentlyFixed.length === 0) {
    recentFixedEl.innerHTML = "<li>No repaired reports yet.</li>";
  } else {
    recentFixedEl.innerHTML = recentlyFixed
      .map((report) => `<li>${escapeHtml(buildDisplayNameForFixedRoad(report))}</li>`)
      .join("");
  }

  feedbackEl.textContent = stats.total > 0
    ? `Updated with ${stats.total.toLocaleString("en-PH")} report${stats.total === 1 ? "" : "s"} from the connected Google Sheet.`
    : "No report data is available yet from the connected Google Sheet.";
}

function renderReportStatisticsError(error) {
  const feedbackEl = document.getElementById("statsFeedback");
  if (!feedbackEl) return;
  feedbackEl.textContent = toUserFacingLoadErrorMessage(error);
}

async function loadStatistics() {
  try {
    const reports = Array.isArray(cachedReports) && cachedReports.length > 0
      ? cachedReports
      : await fetchReports();
    renderReportStatistics(reports);
  } catch (error) {
    console.log("Error loading statistics", error);
    renderReportStatisticsError(error);
  }
}

function findReportByTracking(reports, trackingNumber) {
  const target = trackingNumber.trim().toLowerCase();
  return reports.find(report => {
    const tracking = getFieldValue(report, ["tracking", "trackingNumber", "track", "Tracking Number", "Tracking #", "Reference Number"]).toString().trim().toLowerCase();
    return tracking === target;
  });
}

async function fetchReportByTracking(trackingNumber) {
  const localReports = getLocalReports();
  const localMatch = findReportByTracking(localReports, trackingNumber);

  if (isCorsRetryCooldownActive()) {
    return localMatch || null;
  }

  const endpoints = buildTrackingLookupEndpoints(trackingNumber);

  let lastError;
  let corsBlocked = false;
  let corsBlockedEndpoint = "";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
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

      if (endpoint.includes("action=getReportByTracking")) {
        const matchedReport = payload && typeof payload === "object"
          ? toReportModel(payload.report || {})
          : null;

        if (matchedReport && matchedReport.tracking) {
          cachedReports = mergeReportsByTracking([matchedReport], localReports);
          return matchedReport;
        }
      }

      const reports = parseReportsFromApi(payload);
      const matchedReport = findReportByTracking(reports, trackingNumber);
      if (matchedReport) {
        cachedReports = mergeReportsByTracking(reports, localReports);
        return matchedReport;
      }
    } catch (error) {
      if (isLikelyCorsBlockedRequest(endpoint, error)) {
        corsBlocked = true;
        corsBlockedEndpoint = endpoint;
        break;
      }
      lastError = error;
    }
  }

  if (corsBlocked) {
    activateCorsRetryCooldown();
    if (localMatch) return localMatch;
    const corsError = new Error(buildCorsErrorMessage(corsBlockedEndpoint));
    reportCorsTroubleshootingContext();
    throw corsError;
  }

  if (lastError instanceof TypeError) {
    if (localMatch) return localMatch;
    throw new Error(buildNetworkErrorMessage());
  }

  if (lastError) throw lastError;
  return localMatch || null;
}

function renderTrackingResult(report) {
  const wrapper = document.getElementById("trackingResultWrapper");
  const tbody = document.getElementById("trackingResultBody");
  if (!wrapper || !tbody) return;

  const lastname = (report.lastname || "").trim();
  const firstname = (report.firstname || "").trim();
  const middleInitial = (report.mi || report.middleinitial || report.middleInitial || "").trim();
  let fullName = (report.name || "").trim() || "Not available";

  if (lastname || firstname || middleInitial) {
    const baseName = [lastname, firstname].filter(Boolean).join(", ");
    fullName = `${baseName}${middleInitial ? ` ${middleInitial}.` : ""}`.trim();
  }

  const trackingNumber = getFieldValue(report, ["tracking", "trackingNumber", "tracking_no", "track", "Tracking Number", "Tracking #", "Reference Number"]).toString().trim() || "Not available";
  const location = (report.location || report.address || "Not available").toString().trim() || "Not available";
  const issueDetails = getFieldValue(report, [
    "issue",
    "issueDetail",
    "issueDetails",
    "issue_detail",
    "issue_details",
    "issueType",
    "issue_type",
    "problem",
    "details",
    "description",
    "concern",
    "Issue",
    "Issue Detail",
    "Issue Details",
    "Issue Type",
    "Details",
    "Report Detail",
    "Report Details"
  ]).toString().trim() || "Not available";

  tbody.innerHTML = `
    <tr>
      <td>${escapeHtml(trackingNumber)}</td>
      <td>${formatSubmissionTime(report)}</td>
      <td>${escapeHtml(fullName)}</td>
      <td>${escapeHtml(location)}</td>
      <td>${escapeHtml(issueDetails)}</td>
      <td><span class="status-pill">${normalizeStatus(report.status)}</span></td>
    </tr>
  `;

  wrapper.hidden = false;
}

async function handleTrackingSearch(event) {
  event.preventDefault();

  const feedback = document.getElementById("trackingSearchFeedback");
  const input = document.getElementById("trackingSearchInput");
  const wrapper = document.getElementById("trackingResultWrapper");
  const tbody = document.getElementById("trackingResultBody");

  if (!input || !feedback || !wrapper || !tbody) return;

  const trackingNumber = input.value.trim();
  if (!trackingNumber) {
    feedback.textContent = "Please enter a valid tracking number.";
    wrapper.hidden = true;
    tbody.innerHTML = "";
    return;
  }

  feedback.textContent = "Searching report...";

  try {
    const matchedReport = await fetchReportByTracking(trackingNumber);

    if (!matchedReport) {
      feedback.textContent = "No report found for this tracking number.";
      wrapper.hidden = true;
      tbody.innerHTML = "";
      return;
    }

    renderTrackingResult(matchedReport);
    feedback.textContent = "Report found.";
  } catch (error) {
    console.error("Tracking search failed", error);
    if (isCorsConfigurationIssue(error)) {
      reportCorsTroubleshootingContext();
    }
    feedback.textContent = error?.message || "Unable to search right now. Please try again later.";
    wrapper.hidden = true;
    tbody.innerHTML = "";
  }
}

// Photo preview
document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const introOverlay = document.getElementById("brandIntro");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (body) {
    if (prefersReducedMotion) {
      body.classList.add("intro-done");
      introOverlay?.setAttribute("aria-hidden", "true");
    } else {
      body.classList.add("intro-playing");
      introOverlay?.setAttribute("aria-hidden", "false");

      setTimeout(() => {
        body.classList.remove("intro-playing");
        body.classList.add("intro-done");
        introOverlay?.setAttribute("aria-hidden", "true");
      }, 1450);
    }
  }

  const initialPage = resolveInitialPage();
  showPage(initialPage);
  loadStatistics();

  const revealTargets = document.querySelectorAll(".hero-card, .card, .issue-card");
  revealTargets.forEach((el) => el.classList.add("reveal-target"));

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -5% 0px" });

    revealTargets.forEach((el) => revealObserver.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("revealed"));
  }

  const menu = document.getElementById("menu");
  const menuBtn = document.getElementById("menuBtn");

  document.addEventListener("pointerdown", (event) => {
    if (!isMenuOpen()) return;

    const clickInsideSidebar = menu?.contains(event.target);
    const clickMenuToggle = menuBtn?.contains(event.target);

    if (!clickInsideSidebar && !clickMenuToggle) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isMenuOpen()) {
      closeMenu();
    }
  });

  const photoInput = document.getElementById("photo");
  const preview = document.getElementById("photoPreview");

  if (photoInput && preview) {
    photoInput.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        preview.src = e.target.result;
        preview.style.display = "block";
      };
      reader.readAsDataURL(file);
    });
  }

  const trackSearchForm = document.getElementById("trackSearchForm");
  if (trackSearchForm) {
    trackSearchForm.addEventListener("submit", handleTrackingSearch);
  }

  const liveStatus = document.getElementById("liveStatus");
  const statuses = [
    "Live updates active across Metro Manila",
    "Citizens are reporting hazards in real-time",
    "Safer roads start with your report"
  ];

  if (liveStatus) {
    let statusIndex = 0;
    setInterval(() => {
      statusIndex = (statusIndex + 1) % statuses.length;
      liveStatus.textContent = statuses[statusIndex];
    }, 3200);
  }
});

// Submit report
async function submitReport() {
  if (isSubmittingReport) return;

  if (lat === 0 && !document.getElementById("locationText").value.trim()) {
    alert("Please select location on map or type the road name");
    return;
  }

  isSubmittingReport = true;

  let tracking = "RW" + Date.now();

  let photoData = "";
  try {
    photoData = await readPhotoAsDataUrl();
  } catch (error) {
    alert(error.message || "Unable to read photo before submitting.");
    isSubmittingReport = false;
    return;
  }

  const reportPayload = {
    tracking,
    lastname: document.getElementById("lastname").value,
    firstname: document.getElementById("firstname").value,
    mi: document.getElementById("mi").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    location: document.getElementById("locationText").value,
    issue: document.getElementById("issue").value,
    lat: lat || "",
    lng: lng || "",
    photo: photoData
  };

  const formUrlEncoded = new URLSearchParams(reportPayload);

  const submitEndpoints = [API_URL];

  const trySubmit = async () => {
    let lastError;
    let corsBlocked = false;
    let corsBlockedEndpoint = "";

    for (const endpoint of submitEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: formUrlEncoded,
          redirect: "follow"
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.text();
      } catch (error) {
        if (isLikelyCorsBlockedRequest(endpoint, error)) {
          corsBlocked = true;
          corsBlockedEndpoint = endpoint;
          lastError = error;
          break;
        }
        lastError = error;
      }
    }

    if (corsBlocked) {
      const corsError = new Error(buildCorsErrorMessage(corsBlockedEndpoint));
      reportCorsTroubleshootingContext();
      throw corsError;
    }
    if (lastError instanceof TypeError) throw new Error(buildNetworkErrorMessage());
    throw lastError || new Error("Unable to submit report");
  };

  try {
    const res = await trySubmit();
    if (res) {
      let payload;
      try {
        payload = JSON.parse(res);
      } catch (error) {
        payload = null;
      }

      if (payload && payload.success === false) {
        throw new Error(payload.error || "Submission failed.");
      }
    }

    document.getElementById("trackInfo").innerText = "Tracking Number: " + tracking;
    cacheLocalSubmission(reportPayload);
    cachedReports = [];
    loadStatistics();
    document.getElementById("popup").classList.add("show");
  } catch (err) {
    console.error(err);
    alert(err.message || "Submission failed. Check your API or internet connection.");
  } finally {
    isSubmittingReport = false;
  }
}

// Hide popup
function closePopup() {
  document.getElementById("popup").classList.remove("show");
  showPage('home');
  resetForm();
}

function newReport() {
  document.getElementById("popup").classList.remove("show");
  resetForm();
  showPage('submit');
}
// Reset the form
function resetForm() {
  document.querySelectorAll("#submit input,#submit textarea").forEach(el => el.value = "");
  document.getElementById("selectedLocation").innerText = "No location selected";
  lat = 0;
  lng = 0;
  if (marker) map.removeLayer(marker);
  document.getElementById("photoPreview").style.display = "none";
}

function hasValidCoordinates(report) {
  const reportLat = parseFloat(report?.lat);
  const reportLng = parseFloat(report?.lng);

  if (!Number.isFinite(reportLat) || !Number.isFinite(reportLng)) return false;
  if (reportLat < -90 || reportLat > 90) return false;
  if (reportLng < -180 || reportLng > 180) return false;
  if (reportLat === 0 && reportLng === 0) return false;

  return true;
}
