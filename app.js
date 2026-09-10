(() => {
  "use strict";

  const DEFAULT_CHECKLISTS = JSON.parse(JSON.stringify(window.GHP_CHECKLISTS || {
    production: { label: "ฝ่ายผลิต", shortLabel: "ผลิต", sections: window.GHP_SECTIONS || [] },
  }));
  const DEFAULT_MASTER_DATA = {
    sites: ["โรงงานบางพลี", "โรงงานเทพารักษ์", "KCG Logistics Park", "IDG บางนา"],
    departments: ["PD4"],
    areas: ["Dairy filling"],
  };
  const BANGPHLI_SITE = "โรงงานบางพลี";
  const THEPHARAK_SITE = "โรงงานเทพารักษ์";
  const DEFAULT_SITE_ZONE_LOCATIONS = {
    [BANGPHLI_SITE]: {
      "Zone 1": ["PD1_Cracker A,B"],
      "Zone 2": ["PD2_Cookie"],
      "Zone 3": ["PD2_Jelly powder"],
      "Zone 4": ["PD2_Repack"],
      "Zone 5": ["PD2_Mixed flour"],
      "Zone 6": ["PD3_Sunquick"],
      "Zone 7": ["PD3_Syrup"],
      "Zone 8": ["PD3_Wafer"],
      "Zone 9": ["PD4_Jelly cup"],
      "Zone 10": ["PD4_Cherry"],
      "Zone 11": ["PD4_Jam/Non Dairy filling"],
      "Zone 12": ["PD4_Dairy filling"],
      "Zone 13": ["GN_รอบนอก"],
      "Zone 14": ["WH RM/PM"],
      "Zone 15": ["Logistic Park"],
      "Zone 16": ["Engineer"],
    },
    [THEPHARAK_SITE]: {
      "Zone 1": ["คลังอาคาร 1 : คลัง Chill, Air"],
      "Zone 2": ["แผนกวิศวกรรม"],
      "Zone 3": ["ไลน์ Processed Cheese ชั้น 1, ชั้น M, A3, ห้อง Allergen/Non-Allergen อาคาร 4"],
      "Zone 4": ["ไลน์ Butter/Margarine, Tank น้ำมัน, ห้อง Allergen/Non-Allergen อาคาร 3"],
      "Zone 5": ["ไลน์ Processed Cheese ชั้น 2, C9, C10, Blast Chill"],
      "Zone 6": ["ไลน์ Natural Cheese"],
      "Zone 7": ["คลังสินค้าอาคาร 4 : C6, อาคาร 2 : A1, อาคาร 4 ข้าง Bulk Gas, อาคารโรงอาหารชั้น 3, 4"],
      "Zone 8": ["ทางเดินไปโรงอาหาร, โรงอาหาร, ห้องซักรีด, ห้องน้ำผลิตอาคาร 2, 4"],
      "Zone 9": ["คลังอาคาร 2 คลัง PK, ห้องเก็บกลิ่นสี, คลังเก็บสารเคมี"],
      "Zone 10": ["ลานโหลดรถเล็ก & รถใหญ่, รถขนส่งและลานจอดรถขนส่ง"],
    },
  };
  const SITE_ZONE_DATA_VERSION = 2;
  const DEFAULT_SITE_ZONE_CHECKLIST_TYPES = {
    [BANGPHLI_SITE]: {
      "Zone 1": "production", "Zone 2": "production", "Zone 3": "production", "Zone 4": "production",
      "Zone 5": "production", "Zone 6": "production", "Zone 7": "production", "Zone 8": "production",
      "Zone 9": "production", "Zone 10": "production", "Zone 11": "production", "Zone 12": "production",
      "Zone 13": "outside", "Zone 14": "warehouse", "Zone 15": "warehouse", "Zone 16": "outside",
    },
    [THEPHARAK_SITE]: {
      "Zone 1": "warehouse", "Zone 2": "outside", "Zone 3": "production", "Zone 4": "production",
      "Zone 5": "production", "Zone 6": "production", "Zone 7": "warehouse", "Zone 8": "outside",
      "Zone 9": "warehouse", "Zone 10": "outside",
    },
  };
  const DEFAULT_DASHBOARD_MANUAL_DATA = {
    source: "automatic",
    zoneScores: [],
    scoreTrend: [],
    findingMix: { major: "", minor: "", observe: "" },
    siteComparison: [],
  };
  const DEFAULT_AUDIT_TITLE = "แบบการตรวจประเมิน GHP เขตพื้นที่การผลิตและคลังสินค้า";
  const LEGACY_AUDIT_TITLES = new Set(["การตรวจประเมิน GHP เขตพื้นที่การผลิต"]);
  const MASTER_LABELS = { sites: "Site / สถานที่ตั้ง", departments: "แผนก (Site อื่น)", areas: "พื้นที่ตรวจ (Site อื่น)" };
  let checklistSets = JSON.parse(JSON.stringify(DEFAULT_CHECKLISTS));
  let activeChecklistType = "production";
  let adminChecklistType = "production";
  let sections = checklistSets.production.sections;
  let masterData = JSON.parse(JSON.stringify(DEFAULT_MASTER_DATA));
  let siteZoneLocations = JSON.parse(JSON.stringify(DEFAULT_SITE_ZONE_LOCATIONS));
  let siteZoneChecklistTypes = JSON.parse(JSON.stringify(DEFAULT_SITE_ZONE_CHECKLIST_TYPES));
  let dashboardManualData = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_MANUAL_DATA));
  let allItems = [];
  const PASS_THRESHOLD = 87;
  const PROFILES = {
    pd: { label: "Checklist PD", comply: 2, observe: 1, minor: 0, major: -1 },
    definition: { label: "Definition", comply: 2, observe: 1.5, minor: 1, major: 0 },
  };
  const RATING_LABELS = { comply: "Comply", observe: "Observe", minor: "Minor", major: "Major" };
  const ACTION_STATUS_LABELS = { open: "รอดำเนินการ", in_progress: "กำลังแก้ไข", closed: "ปิดแล้ว" };
  const FINDING_RULES = {
    major: { label: "Major", deadline: "7 วันทำการ", days: 7 },
    minor: { label: "Minor", deadline: "10 วันทำการ", days: 10 },
    observe: { label: "Observe", deadline: "15 วันทำการ", days: 15 },
  };
  const DB_NAME = "ghp-audit-monitoring";
  const STORE_NAME = "audits";
  const SETTINGS_KEY = "ghp-checklist-settings-v1";
  const THEME_KEY = "ghp-color-theme";
  const ADMIN_SALT = "ghp-admin-v1:";
  const ADMIN_HASH = "632310defa63789305fed1b53d19186894a126dee092d4070e8d238b4023d728";

  const els = {};
  let db;
  let audit;
  let currentStep = "dashboard";
  let searchTerm = "";
  let findingsOnly = false;
  let dashboardFilters = { month: "all", site: "all", zone: "all", area: "all", type: "all" };
  let dashboardZoneScoreDraft = { id: "", month: "", site: "", zone: "", score: "", isNA: false };
  let defectEntryMode = false;
  let saveTimer;
  let checklistSaveTimer;
  let toastTimer;
  let isAdmin = sessionStorage.getItem("ghp-admin-session") === "active";

  function normalizeDashboardManualData(value) {
    const normalizedNumber = (input, max = Infinity) => {
      if (input === "" || input == null) return "";
      const number = Number(input);
      if (!Number.isFinite(number)) return "";
      return String(Math.min(max, Math.max(0, number)));
    };
    return {
      source: value?.source === "manual" ? "manual" : "automatic",
      zoneScores: Array.isArray(value?.zoneScores) ? value.zoneScores.map((row) => ({
        id: String(row?.id || uid()),
        month: /^\d{4}-\d{2}$/.test(row?.month || "") ? row.month : "",
        site: String(row?.site || ""),
        zone: String(row?.zone || ""),
        score: row?.isNA ? "" : normalizedNumber(row?.score, 100),
        isNA: Boolean(row?.isNA),
        updatedAt: String(row?.updatedAt || ""),
      })) : [],
      scoreTrend: Array.isArray(value?.scoreTrend) ? value.scoreTrend.map((row) => ({
        month: /^\d{4}-\d{2}$/.test(row?.month || "") ? row.month : "",
        score: normalizedNumber(row?.score, 100),
        count: normalizedNumber(row?.count),
      })) : [],
      findingMix: {
        major: normalizedNumber(value?.findingMix?.major),
        minor: normalizedNumber(value?.findingMix?.minor),
        observe: normalizedNumber(value?.findingMix?.observe),
      },
      siteComparison: Array.isArray(value?.siteComparison) ? value.siteComparison.map((row) => ({
        site: String(row?.site || ""),
        score: normalizedNumber(row?.score, 100),
        count: normalizedNumber(row?.count),
      })) : [],
    };
  }

  function aggregateManualZoneScores(rows = dashboardManualData.zoneScores) {
    const validRows = rows.filter((row) => !row.isNA && row.month && row.site.trim() && row.zone.trim() && row.score !== "" && Number.isFinite(Number(row.score)))
      .map((row) => ({ ...row, score: Math.min(100, Math.max(0, Number(row.score))) }));
    const trendGroups = new Map();
    const siteGroups = new Map();
    validRows.forEach((row) => {
      if (!trendGroups.has(row.month)) trendGroups.set(row.month, []);
      trendGroups.get(row.month).push(row.score);
      if (!siteGroups.has(row.site)) siteGroups.set(row.site, []);
      siteGroups.get(row.site).push(row.score);
    });
    const trendData = [...trendGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, scores]) => ({
      month,
      count: scores.length,
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    }));
    const siteData = [...siteGroups.entries()].map(([site, scores]) => ({
      site,
      count: scores.length,
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    })).sort((a, b) => b.average - a.average).slice(0, 6);
    return { validRows, trendData, siteData, naCount: rows.filter((row) => row.isNA).length };
  }

  function rebuildItems() {
    allItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })));
  }
  function checklistForType(type) {
    return checklistSets[type] || checklistSets.production || Object.values(checklistSets)[0];
  }
  function sectionsForType(type) {
    return checklistForType(type)?.sections || [];
  }
  function itemsForType(type) {
    return sectionsForType(type).flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })));
  }
  function auditTypeLabel(type) {
    return checklistForType(type)?.label || "ฝ่ายผลิต";
  }
  function activateChecklist(type) {
    activeChecklistType = checklistSets[type] ? type : "production";
    sections = sectionsForType(activeChecklistType);
    rebuildItems();
  }
  function activateAuditChecklist(entry = audit) {
    activateChecklist(entry?.meta?.auditType || "production");
  }
  rebuildItems();

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }
  function selectOptions(values, selected, placeholder) {
    const unique = [...new Set([...(values || []), ...(selected && !(values || []).includes(selected) ? [selected] : [])])];
    return `<option value="">${escapeHtml(placeholder)}</option>${unique.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  }
  function zoneLocationsForSite(site = audit?.meta?.site) {
    return siteZoneLocations[site] || null;
  }
  function isZoneSite(site = audit?.meta?.site) {
    return Boolean(zoneLocationsForSite(site));
  }
  function isZone(value, site = audit?.meta?.site) {
    return Object.prototype.hasOwnProperty.call(zoneLocationsForSite(site) || {}, value);
  }
  function isAnyZone(value) {
    return Object.values(siteZoneLocations).some((zones) => Object.prototype.hasOwnProperty.call(zones, value));
  }
  function allZoneLocations() {
    return Object.values(siteZoneLocations).flatMap((zones) => Object.values(zones).flat());
  }
  function normalizeBangphliAreaLabel(value) {
    return String(value || "").replace(/^Zone\s+\d+\s*[-_]\s*/i, "");
  }
  function departmentOptionsFor(entry = audit) {
    return isZoneSite(entry?.meta?.site) ? Object.keys(zoneLocationsForSite(entry.meta.site)) : masterData.departments;
  }
  function areaOptionsFor(entry = audit) {
    if (!isZoneSite(entry?.meta?.site)) return masterData.areas;
    return zoneLocationsForSite(entry.meta.site)?.[entry.meta.department] || [];
  }
  function checklistTypeForZone(entry = audit) {
    return siteZoneChecklistTypes[entry?.meta?.site]?.[entry?.meta?.department] || null;
  }
  function uid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function formatDate(value) {
    if (!value) return "ยังไม่ระบุวันที่";
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
  }
  function auditMonthFor(entry) {
    const savedMonth = entry?.meta?.auditMonth;
    if (/^\d{4}-\d{2}$/.test(savedMonth || "")) return savedMonth;
    const auditDate = entry?.meta?.auditDate;
    return /^\d{4}-\d{2}-\d{2}$/.test(auditDate || "") ? auditDate.slice(0, 7) : "unspecified";
  }
  function formatAuditMonth(value) {
    if (value === "unspecified") return "ไม่ระบุเดือนตรวจ";
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`));
  }
  function formatAuditMonthShort(value) {
    if (value === "unspecified") return "ไม่ระบุ";
    return new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(new Date(`${value}-01T00:00:00`));
  }
  function dashboardFilterOptions(values, selected, allLabel) {
    return `<option value="all">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  }
  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#17181b" : "#db241c");
    if (els.themeToggle) {
      const isDark = nextTheme === "dark";
      els.themeToggle.textContent = isDark ? "☀" : "☾";
      els.themeToggle.title = isDark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด";
      els.themeToggle.setAttribute("aria-label", els.themeToggle.title);
      els.themeToggle.setAttribute("aria-pressed", String(isDark));
    }
  }
  function sectionShortTitle(section) {
    const clean = section.title.replace(/^\d+\.\s*/, "").trim();
    if (section.id === "1") return "สถานที่";
    if (section.id === "2") return "อุปกรณ์";
    if (section.id === "3") return "การผลิต";
    if (section.id === "4") return "สุขาภิบาล";
    if (section.id === "5") return "บุคลากร";
    if (section.id === "6") return "Food Defense";
    return clean;
  }
  function createAudit(type = "production") {
    const auditType = checklistSets[type] ? type : "production";
    const auditItems = itemsForType(auditType);
    const responses = {};
    auditItems.forEach((item) => {
      responses[item.id] = {
        rating: null,
        note: "",
        photos: [],
        correctiveAction: "",
        responsibility: "",
        targetDate: "",
        actionStatus: "open",
        closurePhotos: [],
      };
    });
    const now = new Date().toISOString();
    return {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      scoringProfile: "pd",
      sectionConfirmations: {},
      meta: {
        title: DEFAULT_AUDIT_TITLE,
        auditType,
        site: "",
        department: "",
        area: "",
        auditDate: today(),
        auditMonth: today().slice(0, 7),
        auditor: "",
        auditee: "",
      },
      responses,
    };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      // Open the current database version without forcing an upgrade. This keeps
      // the app usable when an older tab is still open on the same device.
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function dbRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function loadChecklistSettings() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    } catch (error) {
      console.warn("Unable to read checklist settings", error);
    }
    if (saved?.checklists && typeof saved.checklists === "object") {
      Object.keys(DEFAULT_CHECKLISTS).forEach((type) => {
        if (Array.isArray(saved.checklists[type]?.sections) && saved.checklists[type].sections.length) {
          checklistSets[type].sections = saved.checklists[type].sections;
        }
      });
    } else if (Array.isArray(saved?.sections) && saved.sections.length) {
      checklistSets.production.sections = saved.sections;
    }
    if (saved?.masterData) {
      Object.keys(DEFAULT_MASTER_DATA).forEach((key) => {
        if (Array.isArray(saved.masterData[key]) && saved.masterData[key].length) masterData[key] = saved.masterData[key];
      });
    }
    if (saved?.siteZoneLocations && typeof saved.siteZoneLocations === "object") {
      Object.entries(saved.siteZoneLocations).forEach(([site, savedZones]) => {
        if (!savedZones || typeof savedZones !== "object") return;
        if (site === THEPHARAK_SITE && saved.siteZoneDataVersion !== SITE_ZONE_DATA_VERSION) return;
        siteZoneLocations[site] = Object.fromEntries(Object.entries(savedZones)
          .filter(([, locations]) => Array.isArray(locations))
          .map(([zone, locations]) => [zone, site === BANGPHLI_SITE ? locations.map(normalizeBangphliAreaLabel) : locations]));
      });
    } else if (saved?.zoneLocations && typeof saved.zoneLocations === "object") {
      Object.keys(DEFAULT_SITE_ZONE_LOCATIONS[THEPHARAK_SITE]).forEach((zone) => {
        if (Array.isArray(saved.zoneLocations[zone])) {
          siteZoneLocations[THEPHARAK_SITE][zone] = saved.zoneLocations[zone];
        }
      });
    }
    if (saved?.siteZoneChecklistTypes && typeof saved.siteZoneChecklistTypes === "object") {
      Object.entries(saved.siteZoneChecklistTypes).forEach(([site, zoneTypes]) => {
        if (!zoneTypes || typeof zoneTypes !== "object") return;
        siteZoneChecklistTypes[site] = { ...(siteZoneChecklistTypes[site] || {}), ...zoneTypes };
      });
    }
    dashboardManualData = normalizeDashboardManualData(saved?.dashboardManualData || DEFAULT_DASHBOARD_MANUAL_DATA);
    Object.entries(siteZoneLocations).forEach(([site, zones]) => {
      if (!siteZoneChecklistTypes[site]) siteZoneChecklistTypes[site] = {};
      Object.keys(zones).forEach((zone) => {
        if (!checklistSets[siteZoneChecklistTypes[site][zone]]) siteZoneChecklistTypes[site][zone] = "production";
      });
    });
    activateChecklist(activeChecklistType);
  }
  async function saveChecklistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ checklists: checklistSets, masterData, siteZoneLocations, siteZoneChecklistTypes, dashboardManualData, siteZoneDataVersion: SITE_ZONE_DATA_VERSION, updatedAt: new Date().toISOString() }));
  }
  function scheduleChecklistSave() {
    els.saveStatus.classList.add("saving");
    els.saveStatus.lastChild.textContent = "กำลังบันทึก";
    clearTimeout(checklistSaveTimer);
    checklistSaveTimer = setTimeout(async () => {
      try {
        await saveChecklistSettings();
        els.saveStatus.classList.remove("saving");
        els.saveStatus.lastChild.textContent = "บันทึกแล้ว";
      } catch (error) {
        console.error(error);
        showToast("บันทึกการตั้งค่าไม่สำเร็จ");
      }
    }, 450);
  }
  function saveNow() {
    audit.updatedAt = new Date().toISOString();
    return dbRequest("readwrite", (store) => store.put(audit));
  }
  function scheduleSave() {
    els.saveStatus.classList.add("saving");
    els.saveStatus.lastChild.textContent = "กำลังบันทึก";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await saveNow();
        els.saveStatus.classList.remove("saving");
        els.saveStatus.lastChild.textContent = "บันทึกแล้ว";
      } catch (error) {
        console.error(error);
        els.saveStatus.classList.remove("saving");
        els.saveStatus.lastChild.textContent = "บันทึกไม่สำเร็จ";
        showToast("พื้นที่จัดเก็บไม่เพียงพอ กรุณาส่งออกข้อมูลสำรอง");
      }
    }, 350);
  }
  async function listAudits() {
    const results = await dbRequest("readonly", (store) => store.getAll());
    return results.map(normalizeAudit).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function normalizeAudit(entry) {
    if (!entry.meta) entry.meta = {};
    if (!entry.meta.title || LEGACY_AUDIT_TITLES.has(entry.meta.title)) entry.meta.title = DEFAULT_AUDIT_TITLE;
    if (!checklistSets[entry.meta.auditType]) entry.meta.auditType = "production";
    if (entry.meta.site === BANGPHLI_SITE) entry.meta.area = normalizeBangphliAreaLabel(entry.meta.area);
    return entry;
  }

  async function changeAuditChecklistType(nextType, message) {
    const previousType = audit.meta.auditType || "production";
    if (nextType === previousType) return true;
    if (!checklistSets[nextType]) return false;
    const hasProgress = Object.values(audit.responses || {}).some((response) => response?.rating || response?.note || response?.photos?.length || response?.correctiveAction || response?.closurePhotos?.length);
    if (hasProgress && !confirm(message || `เปลี่ยนจากแบบตรวจ ${auditTypeLabel(previousType)} เป็น ${auditTypeLabel(nextType)} หรือไม่? คำตอบและรูปแนบเดิมในแบบตรวจนี้จะถูกล้าง`)) return false;
    audit.meta.auditType = nextType;
    activateChecklist(nextType);
    audit.responses = {};
    allItems.forEach((item) => responseFor(item.id));
    audit.sectionConfirmations = {};
    audit.status = "draft";
    await saveNow();
    return true;
  }

  function responseFor(itemId) {
    if (!audit.responses) audit.responses = {};
    if (!audit.responses[itemId]) audit.responses[itemId] = {};
    const response = audit.responses[itemId];
    if (!("rating" in response)) response.rating = null;
    if (!("note" in response)) response.note = "";
    if (!Array.isArray(response.photos)) response.photos = [];
    if (!Array.isArray(response.findingEntries)) {
      const savedNotes = Array.isArray(response.findingNotes) && response.findingNotes.length ? response.findingNotes : [response.note || ""];
      response.findingEntries = savedNotes.map((note, index) => ({ id: uid(), note: String(note || ""), photos: index === 0 ? [...response.photos] : [] }));
      delete response.findingNotes;
    }
    response.findingEntries = response.findingEntries.map((entry) => ({ id: entry?.id || uid(), note: String(entry?.note || ""), photos: Array.isArray(entry?.photos) ? entry.photos : [] }));
    if (!response.findingEntries.length) response.findingEntries.push({ id: uid(), note: "", photos: [] });
    if (!("correctiveAction" in response)) response.correctiveAction = "";
    if (!("responsibility" in response)) response.responsibility = "";
    if (!("targetDate" in response)) response.targetDate = "";
    if (!("actionStatus" in response)) response.actionStatus = "open";
    if (!Array.isArray(response.closurePhotos)) response.closurePhotos = [];
    if (!("autoRatedFromDetail" in response)) response.autoRatedFromDetail = false;
    return response;
  }
  function findingEntriesFor(response) {
    if (!Array.isArray(response.findingEntries)) response.findingEntries = [{ id: uid(), note: response.note || "", photos: [...(response.photos || [])] }];
    if (!response.findingEntries.length) response.findingEntries.push({ id: uid(), note: "", photos: [] });
    return response.findingEntries;
  }
  function activeFindingEntries(response) {
    return findingEntriesFor(response).filter((entry) => entry.note.trim() || entry.photos.length);
  }
  function syncFindingEntries(response) {
    const activeEntries = activeFindingEntries(response);
    const notes = activeEntries.map((entry) => entry.note.trim()).filter(Boolean);
    response.note = notes.length > 1 ? notes.map((note, index) => `${index + 1}. ${note}`).join("\n") : (notes[0] || "");
    response.photos = activeEntries.flatMap((entry) => entry.photos);
  }
  function profile() { return PROFILES[audit.scoringProfile] || PROFILES.pd; }
  function itemScore(itemId) {
    const rating = responseFor(itemId).rating;
    return rating ? profile()[rating] : 0;
  }
  function getStats(items = allItems) {
    const counts = { comply: 0, observe: 0, minor: 0, major: 0 };
    let answered = 0;
    let score = 0;
    items.forEach((item) => {
      const rating = responseFor(item.id).rating;
      if (rating) {
        answered += 1;
        counts[rating] += 1;
        score += profile()[rating];
      }
    });
    const possibleAnswered = answered * 2;
    const percent = possibleAnswered ? (score / possibleAnswered) * 100 : null;
    return { answered, total: items.length, score, maxScore: items.length * 2, percent, counts };
  }
  function displayPercent(value) {
    return value === null ? "—" : Math.max(0, value).toFixed(value === 100 ? 0 : 1);
  }
  function getFindings() {
    return allItems.map((item) => ({
      item,
      response: responseFor(item.id),
      section: sections.find((section) => section.id === item.sectionId),
    })).filter(({ response }) => FINDING_RULES[response.rating]);
  }
  function suggestedTargetDate(rating) {
    const days = FINDING_RULES[rating]?.days;
    if (!days || !audit.meta.auditDate) return "";
    const date = new Date(`${audit.meta.auditDate}T00:00:00`);
    let added = 0;
    while (added < days) {
      date.setDate(date.getDate() + 1);
      const weekday = date.getDay();
      if (weekday !== 0 && weekday !== 6) added += 1;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function missingAuditMeta() {
    const required = {
      site: "Site",
      department: "แผนก / Zone",
      area: "พื้นที่ตรวจ",
      auditDate: "วันที่ตรวจ",
      auditor: "ผู้ตรวจ",
    };
    return Object.entries(required).filter(([key]) => !String(audit.meta?.[key] || "").trim());
  }

  function renderNav() {
    const metaActive = currentStep === "meta";
    const checklistActive = currentStep === "checklist";
    const metaComplete = missingAuditMeta().length === 0;
    const findings = getFindings();
    const openFindings = findings.filter(({ response }) => response.actionStatus !== "closed").length;
    const items = [
      `<button class="nav-item nav-main ${currentStep === "dashboard" ? "active" : ""}" data-step="dashboard" data-short="ภาพรวม"><span class="nav-number">⌂</span><span class="nav-label">Dashboard ภาพรวม</span><span class="nav-progress">ดูผล</span></button>`,
      `<button class="nav-item nav-main ${metaActive ? "active" : ""} ${metaComplete ? "complete" : ""}" data-step="meta" data-short="กรอกแบบตรวจ"><span class="nav-number">✎</span><span class="nav-label">กรอกแบบตรวจ</span><span class="nav-progress">${metaComplete ? "พร้อม" : "เริ่มกรอก"}</span></button>`,
      `<button class="nav-item nav-main defect-entry-nav ${defectEntryMode && checklistActive ? "active" : ""}" data-nav-action="enter-defect" data-short="กรอกข้อบกพร่อง"><span class="nav-number">＋</span><span class="nav-label">กรอกข้อบกพร่อง</span><span class="nav-progress">บันทึกสิ่งที่พบ</span></button>`,
      `<button class="nav-item nav-main ${currentStep === "defects" ? "active" : ""} ${findings.length && !openFindings ? "complete" : ""}" data-step="defects" data-short="ตอบข้อบกพร่อง"><span class="nav-number">!</span><span class="nav-label">ตอบกลับข้อบกพร่อง</span><span class="nav-progress">${openFindings ? `${openFindings} เปิด` : findings.length ? "ปิดครบ" : "ยังไม่มี"}</span></button>`,
      `<button class="nav-item nav-main print-nav" data-nav-action="print-blank" data-short="พิมพ์ฟอร์ม"><span class="nav-number">▤</span><span class="nav-label">พิมพ์ฟอร์มเปล่า</span><span class="nav-progress">พร้อมพิมพ์</span></button>`,
      `<button class="nav-item nav-main admin-nav ${currentStep === "admin" ? "active" : ""}" data-step="admin" data-short="Admin"><span class="nav-number">${isAdmin ? "⚙" : "▣"}</span><span class="nav-label">ผู้ดูแลระบบ</span><span class="nav-progress">${isAdmin ? "เข้าใช้งาน" : "ล็อก"}</span></button>`,
    ];
    els.sectionNav.innerHTML = items.join("");
  }

  function entryStats(entry) {
    const responses = entry.responses || {};
    const entryItems = itemsForType(entry.meta?.auditType || "production");
    const counts = { comply: 0, observe: 0, minor: 0, major: 0 };
    let answered = 0;
    let score = 0;
    const entryProfile = PROFILES[entry.scoringProfile] || PROFILES.pd;
    entryItems.forEach((item) => {
      const rating = responses[item.id]?.rating;
      if (!rating) return;
      answered += 1;
      counts[rating] += 1;
      score += entryProfile[rating];
    });
    return { answered, total: entryItems.length, counts, percent: answered ? (score / (answered * 2)) * 100 : null };
  }

  async function renderDashboard() {
    const currentStats = getStats();
    const currentFindings = getFindings();
    const currentOpenFindings = currentFindings.filter(({ response }) => response.actionStatus !== "closed");
    let audits = [];
    try {
      audits = await listAudits();
    } catch (error) {
      console.error(error);
    }
    if (currentStep !== "dashboard") return;

    const monthValues = [...new Set(audits.map(auditMonthFor))].sort((a, b) => b.localeCompare(a));
    const siteValues = [...new Set(audits.map((entry) => entry.meta?.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    if (dashboardFilters.month !== "all" && !monthValues.includes(dashboardFilters.month)) dashboardFilters.month = "all";
    if (dashboardFilters.site !== "all" && !siteValues.includes(dashboardFilters.site)) dashboardFilters.site = "all";
    const zoneSource = dashboardFilters.site === "all" ? audits : audits.filter((entry) => entry.meta?.site === dashboardFilters.site);
    const zoneValues = [...new Set(zoneSource.map((entry) => entry.meta?.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    if (dashboardFilters.zone !== "all" && !zoneValues.includes(dashboardFilters.zone)) dashboardFilters.zone = "all";
    const areaSource = zoneSource.filter((entry) => dashboardFilters.zone === "all" || entry.meta?.department === dashboardFilters.zone);
    const areaValues = [...new Set(areaSource.map((entry) => entry.meta?.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    if (dashboardFilters.area !== "all" && !areaValues.includes(dashboardFilters.area)) dashboardFilters.area = "all";
    if (dashboardFilters.type !== "all" && !checklistSets[dashboardFilters.type]) dashboardFilters.type = "all";

    const filteredAudits = audits.filter((entry) => (
      (dashboardFilters.month === "all" || auditMonthFor(entry) === dashboardFilters.month)
      && (dashboardFilters.site === "all" || entry.meta?.site === dashboardFilters.site)
      && (dashboardFilters.zone === "all" || entry.meta?.department === dashboardFilters.zone)
      && (dashboardFilters.area === "all" || entry.meta?.area === dashboardFilters.area)
      && (dashboardFilters.type === "all" || entry.meta?.auditType === dashboardFilters.type)
    ));
    const summaries = filteredAudits.map((entry) => ({ entry, stats: entryStats(entry) }));
    const scored = summaries.filter(({ stats }) => stats.percent !== null);
    const averageScore = scored.length ? scored.reduce((sum, { stats }) => sum + stats.percent, 0) / scored.length : null;
    const ratingCounts = summaries.reduce((counts, { stats }) => {
      Object.keys(counts).forEach((rating) => { counts[rating] += stats.counts[rating]; });
      return counts;
    }, { comply: 0, observe: 0, minor: 0, major: 0 });
    const totalFindings = ratingCounts.observe + ratingCounts.minor + ratingCounts.major;
    let closedFindings = 0;
    summaries.forEach(({ entry }) => {
      itemsForType(entry.meta?.auditType).forEach((item) => {
        const response = entry.responses?.[item.id];
        if (FINDING_RULES[response?.rating] && response.actionStatus === "closed") closedFindings += 1;
      });
    });
    const openFindings = totalFindings - closedFindings;
    const closureRate = totalFindings ? Math.round((closedFindings / totalFindings) * 100) : null;
    const completeAudits = filteredAudits.filter((entry) => entry.status === "complete").length;
    const activeFilterCount = Object.values(dashboardFilters).filter((value) => value !== "all").length;

    const trendGroups = new Map();
    summaries.forEach(({ entry, stats }) => {
      const month = auditMonthFor(entry);
      if (!trendGroups.has(month)) trendGroups.set(month, { scores: [], count: 0 });
      const group = trendGroups.get(month);
      group.count += 1;
      if (stats.percent !== null) group.scores.push(stats.percent);
    });
    const trendData = [...trendGroups.entries()]
      .sort(([monthA], [monthB]) => monthA === "unspecified" ? 1 : monthB === "unspecified" ? -1 : monthA.localeCompare(monthB))
      .slice(-6)
      .map(([month, group]) => ({ month, count: group.count, average: group.scores.length ? group.scores.reduce((sum, value) => sum + value, 0) / group.scores.length : null }));

    const siteGroups = new Map();
    summaries.forEach(({ entry, stats }) => {
      const site = entry.meta?.site || "ไม่ระบุ Site";
      if (!siteGroups.has(site)) siteGroups.set(site, { scores: [], count: 0 });
      const group = siteGroups.get(site);
      group.count += 1;
      if (stats.percent !== null) group.scores.push(stats.percent);
    });
    const siteData = [...siteGroups.entries()].map(([site, group]) => ({
      site,
      count: group.count,
      average: group.scores.length ? group.scores.reduce((sum, value) => sum + value, 0) / group.scores.length : null,
    })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1)).slice(0, 6);

    const manualChartSource = dashboardManualData.source === "manual";
    const manualZoneSummary = aggregateManualZoneScores();
    const chartTrendData = manualChartSource
      ? manualZoneSummary.trendData
      : trendData;
    const chartRatingCounts = manualChartSource
      ? {
        major: Math.round(Math.max(0, Number(dashboardManualData.findingMix.major) || 0)),
        minor: Math.round(Math.max(0, Number(dashboardManualData.findingMix.minor) || 0)),
        observe: Math.round(Math.max(0, Number(dashboardManualData.findingMix.observe) || 0)),
      }
      : ratingCounts;
    const chartFindingTotal = chartRatingCounts.major + chartRatingCounts.minor + chartRatingCounts.observe;
    const chartSiteData = manualChartSource
      ? manualZoneSummary.siteData
      : siteData;
    const majorEnd = chartFindingTotal ? (chartRatingCounts.major / chartFindingTotal) * 360 : 0;
    const minorEnd = chartFindingTotal ? majorEnd + (chartRatingCounts.minor / chartFindingTotal) * 360 : 0;
    const donutStyle = chartFindingTotal
      ? `background:conic-gradient(var(--major) 0 ${majorEnd}deg,var(--minor) ${majorEnd}deg ${minorEnd}deg,var(--observe) ${minorEnd}deg 360deg)`
      : "";
    const chartPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
    const recent = filteredAudits.slice(0, 12);
    const recentGroups = recent.reduce((groups, entry) => {
      const month = auditMonthFor(entry);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(entry);
      return groups;
    }, new Map());
    const recentAuditHtml = (entry) => {
      const entrySummary = entryStats(entry);
      const entryFindings = entrySummary.counts.major + entrySummary.counts.minor + entrySummary.counts.observe;
      return `<article class="recent-audit ${entry.id === audit.id ? "active" : ""}" data-audit-id="${escapeHtml(entry.id)}"><button type="button" class="recent-audit-open" data-recent-action="open" aria-label="เปิดแบบตรวจ ${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")}"><span class="recent-date">${escapeHtml(formatDate(entry.meta?.auditDate))}</span><span><b>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")}</b><small>${escapeHtml(auditTypeLabel(entry.meta?.auditType))} · ${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${escapeHtml(entry.meta?.department || "—")} · ${entrySummary.answered}/${entrySummary.total} ข้อ</small></span><span class="recent-result"><b>${displayPercent(entrySummary.percent)}${entrySummary.percent === null ? "" : "%"}</b><small>${entryFindings} ข้อพบ</small></span></button><div class="recent-audit-actions"><button type="button" class="recent-edit-button" data-recent-action="edit">แก้ไข</button><button type="button" class="recent-delete-button" data-recent-action="delete">ลบ</button></div></article>`;
    };
    const sortedRecentGroups = [...recentGroups.entries()].sort(([monthA], [monthB]) => monthA === "unspecified" ? 1 : monthB === "unspecified" ? -1 : monthB.localeCompare(monthA));

    els.dashboardView.innerHTML = `
      <section class="dashboard-hero">
        <div><span class="eyebrow">KCG Corporation · Quality System</span><h2>Dashboard ภาพรวมการตรวจ GHP</h2></div>
        <div class="dashboard-hero-actions">
          <button type="button" class="dashboard-action audit-action" data-dashboard-action="audit"><span class="dashboard-action-icon" aria-hidden="true">✎</span><span class="dashboard-action-copy"><strong>กรอกแบบตรวจ</strong><small>${auditTypeLabel(audit.meta.auditType)} · ${currentStats.answered ? `ทำต่อจาก ${currentStats.answered}/${currentStats.total} ข้อ` : "เริ่มการตรวจประเมิน"}</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></button>
          <button type="button" class="dashboard-action finding-entry-action" data-dashboard-action="enter-defect"><span class="dashboard-action-icon" aria-hidden="true">＋</span><span class="dashboard-action-copy"><strong>กรอกข้อบกพร่อง</strong><small>เริ่มบันทึกได้ทันที แม้ยังไม่ได้กรอกข้อมูลการตรวจ</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></button>
          <button type="button" class="dashboard-action defect-action ${currentOpenFindings.length ? "has-findings" : ""}" data-dashboard-action="defects"><span class="dashboard-action-icon" aria-hidden="true">!</span><span class="dashboard-action-copy"><strong>ตอบกลับข้อบกพร่อง</strong><small>${currentOpenFindings.length ? `${currentOpenFindings.length} รายการรอดำเนินการ` : "ยังไม่มีรายการเปิด"}</small></span>${currentOpenFindings.length ? `<span class="dashboard-action-count" aria-label="${currentOpenFindings.length} รายการ">${currentOpenFindings.length}</span>` : `<span class="dashboard-action-arrow" aria-hidden="true">→</span>`}</button>
          <button type="button" class="dashboard-action print-action" data-dashboard-action="print-blank"><span class="dashboard-action-icon" aria-hidden="true">▤</span><span class="dashboard-action-copy"><strong>พิมพ์ฟอร์มเปล่า</strong><small>สำหรับกรอกผลการตรวจบนกระดาษ</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></button>
        </div>
      </section>
      <section class="dashboard-filter-card" aria-label="ตัวกรอง Dashboard">
        <div class="dashboard-filter-heading"><div><span class="eyebrow">Dashboard filters</span><h3>กรองข้อมูลการตรวจ</h3></div><div><span>แสดง ${filteredAudits.length} จาก ${audits.length} แบบตรวจ</span><button type="button" data-dashboard-action="reset-filters" ${activeFilterCount ? "" : "disabled"}>ล้างตัวกรอง</button></div></div>
        <div class="dashboard-filter-grid">
          <label><span>ประจำเดือน</span><select data-dashboard-filter="month">${`<option value="all">ทุกเดือน</option>${monthValues.map((month) => `<option value="${escapeHtml(month)}" ${dashboardFilters.month === month ? "selected" : ""}>${escapeHtml(formatAuditMonth(month))}</option>`).join("")}`}</select></label>
          <label><span>Site / สถานที่ตั้ง</span><select data-dashboard-filter="site">${dashboardFilterOptions(siteValues, dashboardFilters.site, "ทุก Site")}</select></label>
          <label><span>แผนก / Zone</span><select data-dashboard-filter="zone">${dashboardFilterOptions(zoneValues, dashboardFilters.zone, "ทุกแผนก / Zone")}</select></label>
          <label><span>Zone Location / พื้นที่ตรวจ</span><select data-dashboard-filter="area">${dashboardFilterOptions(areaValues, dashboardFilters.area, "ทุกพื้นที่ตรวจ")}</select></label>
          <label><span>ประเภทแบบตรวจ</span><select data-dashboard-filter="type"><option value="all">ทุกประเภท</option>${Object.entries(checklistSets).map(([type, checklist]) => `<option value="${escapeHtml(type)}" ${dashboardFilters.type === type ? "selected" : ""}>${escapeHtml(checklist.label)}</option>`).join("")}</select></label>
        </div>
      </section>
      <section class="metric-grid" aria-label="สรุปข้อมูลตามตัวกรอง">
        <article class="metric-card score"><span>จำนวนแบบตรวจ</span><strong>${filteredAudits.length}<small> แบบ</small></strong><p>เสร็จสิ้น ${completeAudits} · ฉบับร่าง ${filteredAudits.length - completeAudits}</p></article>
        <article class="metric-card progress"><span>คะแนนเฉลี่ย</span><strong>${displayPercent(averageScore)}<small>${averageScore === null ? "" : "%"}</small></strong><p>คำนวณจาก ${scored.length} แบบตรวจที่มีคะแนน</p><div class="metric-progress"><i style="width:${chartPercent(averageScore)}%"></i></div></article>
        <article class="metric-card findings"><span>ข้อบกพร่องทั้งหมด</span><strong>${totalFindings}<small> ข้อ</small></strong><p>รอดำเนินการ ${openFindings} · ปิดแล้ว ${closedFindings}</p></article>
        <article class="metric-card status"><span>อัตราปิดข้อบกพร่อง</span><strong>${closureRate === null ? "—" : closureRate}<small>${closureRate === null ? "" : "%"}</small></strong><p>${totalFindings ? `ปิดแล้ว ${closedFindings} จาก ${totalFindings} ข้อ` : "ยังไม่มีข้อบกพร่อง"}</p></article>
      </section>
      <section class="dashboard-chart-grid" aria-label="กราฟวิเคราะห์ผลการตรวจ">
        <div class="dashboard-chart-source ${manualChartSource ? "manual" : "automatic"}"><b>${manualChartSource ? "ข้อมูลคะแนนราย Zone ที่ Admin บันทึก" : "ข้อมูลอัตโนมัติจากแบบตรวจ"}</b><span>${manualChartSource ? `คำนวณจาก ${manualZoneSummary.validRows.length} Zone · N/A ${manualZoneSummary.naCount} Zone (ไม่รวมในค่าเฉลี่ย Site) · ตัวกรองด้านบนยังมีผลกับ KPI และรายการแบบตรวจ` : "กราฟคำนวณจากแบบตรวจตามตัวกรองด้านบน"}</span></div>
        <article class="dashboard-card trend-chart-card"><div class="card-heading"><div><span class="eyebrow">Score trend</span><h3>แนวโน้มคะแนนเฉลี่ยรายเดือน</h3></div><small>ล่าสุดไม่เกิน 6 เดือน</small></div>${chartTrendData.length ? `<div class="trend-chart" role="img" aria-label="กราฟคะแนนเฉลี่ยรายเดือน">${chartTrendData.map((point) => `<div class="trend-column" title="${escapeHtml(formatAuditMonth(point.month))}: ${displayPercent(point.average)}${point.average === null ? "" : "%"} จาก ${point.count} ${manualChartSource ? "Zone" : "แบบ"}"><span>${displayPercent(point.average)}${point.average === null ? "" : "%"}</span><div><i style="height:${Math.max(chartPercent(point.average), 4)}%"></i></div><small>${escapeHtml(formatAuditMonthShort(point.month))}</small><em>${point.count} ${manualChartSource ? "Zone" : "แบบ"}</em></div>`).join("")}</div>` : `<div class="dashboard-empty compact">ยังไม่มีข้อมูลสำหรับแสดงแนวโน้ม</div>`}</article>
        <article class="dashboard-card finding-chart-card"><div class="card-heading"><div><span class="eyebrow">Finding mix</span><h3>สัดส่วนข้อบกพร่อง</h3></div></div><div class="finding-donut-wrap"><div class="finding-donut ${chartFindingTotal ? "" : "empty"}" style="${donutStyle}" role="img" aria-label="ข้อบกพร่องรวม ${chartFindingTotal} ข้อ"><span><b>${chartFindingTotal}</b><small>ข้อพบ</small></span></div><div class="chart-legend">${["major", "minor", "observe"].map((rating) => `<span><i class="dot ${rating}"></i>${FINDING_RULES[rating].label}<b>${chartRatingCounts[rating]}</b></span>`).join("")}</div></div></article>
        <article class="dashboard-card site-chart-card"><div class="card-heading"><div><span class="eyebrow">Site comparison</span><h3>คะแนนเฉลี่ยแยกตาม Site</h3></div></div>${chartSiteData.length ? `<div class="site-bars">${chartSiteData.map((point) => `<div class="site-bar"><div><span>${escapeHtml(point.site)}</span><b>${displayPercent(point.average)}${point.average === null ? "" : "%"}</b></div><div class="site-bar-track"><i style="width:${chartPercent(point.average)}%"></i></div><small>${point.count} ${manualChartSource ? "Zone" : "แบบตรวจ"}</small></div>`).join("")}</div>` : `<div class="dashboard-empty compact">ยังไม่มีข้อมูล Site สำหรับเปรียบเทียบ</div>`}</article>
      </section>
      <section class="dashboard-row">
        <article class="dashboard-card severity-card"><div class="card-heading"><div><span class="eyebrow">Current audit</span><h3>ข้อบกพร่องของแบบตรวจที่เปิดอยู่</h3></div><button type="button" class="text-button" data-dashboard-action="defects">ดูและตอบกลับ</button></div><div class="severity-list">${["major", "minor", "observe"].map((rating) => `<button type="button" data-dashboard-action="defects" class="severity-item ${rating}"><span><i class="dot ${rating}"></i>${FINDING_RULES[rating].label}</span><strong>${currentStats.counts[rating]}</strong><small>${FINDING_RULES[rating].deadline}</small></button>`).join("")}</div>${currentFindings.length ? `<div class="closure-progress"><div><span>การปิดข้อบกพร่อง</span><b>${currentFindings.length - currentOpenFindings.length}/${currentFindings.length}</b></div><div class="metric-progress"><i style="width:${Math.round(((currentFindings.length - currentOpenFindings.length) / currentFindings.length) * 100)}%"></i></div></div>` : `<div class="dashboard-empty compact">ยังไม่พบ Major, Minor หรือ Observe</div>`}</article>
        <article class="dashboard-card recent-card"><div class="card-heading"><div><span class="eyebrow">Filtered records</span><h3>แบบตรวจล่าสุด</h3></div><button type="button" class="text-button" data-dashboard-action="history">ดูทั้งหมด</button></div><div class="dashboard-recent">${recent.length ? sortedRecentGroups.map(([month, monthAudits]) => `<section class="recent-month-group"><header><h4>${escapeHtml(formatAuditMonth(month))}</h4><span>${monthAudits.length} แบบตรวจ</span></header><div>${monthAudits.map(recentAuditHtml).join("")}</div></section>`).join("") : `<div class="dashboard-empty compact">${audits.length ? "ไม่พบแบบตรวจตามตัวกรอง" : "ยังไม่มีแบบตรวจ"}</div>`}</div></article>
      </section>`;
  }

  function renderDefects() {
    const findings = getFindings();
    let addedTargetDate = false;
    findings.forEach(({ response }) => {
      if (!response.targetDate) {
        response.targetDate = suggestedTargetDate(response.rating);
        if (response.targetDate) addedTargetDate = true;
      }
    });
    if (addedTargetDate) scheduleSave();
    const openCount = findings.filter(({ response }) => response.actionStatus !== "closed").length;
    els.defectsView.innerHTML = `
      <div class="defects-heading">
        <div><span class="eyebrow">Corrective action</span><h2>ตอบกลับข้อบกพร่อง</h2><p>ระบุผู้รับผิดชอบ วิธีแก้ไข กำหนดเสร็จ สถานะ และแนบรูปหลังแก้ไข</p></div>
        <div class="defect-summary"><strong>${openCount}</strong><span>รายการเปิด<br>จาก ${findings.length} ข้อบกพร่อง</span></div>
      </div>
      ${findings.length ? `<div class="defect-list">${findings.map(({ item, response, section }) => {
        const rule = FINDING_RULES[response.rating];
        const targetValue = response.targetDate;
        const evidenceEntries = activeFindingEntries(response);
        return `<article class="defect-card ${response.rating} ${response.actionStatus === "closed" ? "is-closed" : ""}" data-defect-id="${item.id}">
          <header class="defect-card-head"><div><span class="severity-badge ${response.rating}">${rule.label}</span><b>Requirement ${item.id}</b><small>${escapeHtml(sectionShortTitle(section))}</small></div><span class="sla-label">ภายใน ${rule.deadline}</span></header>
          <div class="defect-requirement"><span>สิ่งที่ต้องตรวจสอบ</span><p>${escapeHtml(item.text).replace(/\n/g, "<br>")}</p></div>
          <div class="defect-evidence"><span>ข้อค้นพบ / หลักฐาน</span><div class="defect-evidence-list">${evidenceEntries.length ? evidenceEntries.map((entry, entryIndex) => `<article><b>รายการที่ ${entryIndex + 1}</b><p>${escapeHtml(entry.note || "ยังไม่ได้ระบุรายละเอียดข้อค้นพบ")}</p>${entry.photos.length ? `<div class="defect-photo-row">${entry.photos.map((photo, photoIndex) => `<img src="${escapeHtml(photo)}" alt="รูปหลักฐานข้อ ${item.id} รายการที่ ${entryIndex + 1} รูปที่ ${photoIndex + 1}" />`).join("")}</div>` : ""}</article>`).join("") : `<p>ยังไม่ได้ระบุรายละเอียดข้อค้นพบ</p>`}</div></div>
          <div class="corrective-grid">
            <label class="field"><span>ผู้รับผิดชอบ</span><input data-corrective="responsibility" value="${escapeHtml(response.responsibility)}" placeholder="ชื่อหรือหน่วยงาน" /></label>
            <label class="field"><span>กำหนดเสร็จ</span><input type="date" data-corrective="targetDate" value="${escapeHtml(targetValue)}" /></label>
            <label class="field"><span>สถานะ</span><select data-corrective="actionStatus">${Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${response.actionStatus === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <label class="field full"><span>การแก้ไขและป้องกันการเกิดซ้ำ</span><textarea data-corrective="correctiveAction" placeholder="อธิบายสิ่งที่ดำเนินการแก้ไข...">${escapeHtml(response.correctiveAction)}</textarea></label>
          </div>
          <div class="closure-attachments"><div><span>รูปหลังแก้ไข</span><small>ถ่ายรูปใหม่ หรือเลือกรูปที่มีอยู่ในเครื่องเพื่อยืนยันผลการดำเนินการ</small></div><div class="attachment-row"><label class="attach-button camera-button">📷 ถ่ายรูปหลังแก้ไข<input type="file" accept="image/*" capture="environment" data-closure-photo /></label><label class="attach-button file-button">🖼 เลือกรูปจากเครื่อง/ไฟล์<input type="file" accept="image/*" multiple data-closure-photo-file /></label>${(response.closurePhotos || []).map((photo, index) => `<span class="photo-wrap"><img class="photo-thumb" src="${escapeHtml(photo)}" alt="รูปหลังแก้ไขข้อ ${item.id}" /><button type="button" class="photo-remove" data-closure-remove="${index}" aria-label="ลบรูปหลังแก้ไข">×</button></span>`).join("")}</div></div>
        </article>`;
      }).join("")}</div>` : `<div class="dashboard-empty defect-empty"><div class="empty-icon">✓</div><h3>ยังไม่มีข้อบกพร่องที่ต้องตอบกลับ</h3><p>เมื่อเลือกระดับ Observe, Minor หรือ Major ในแบบตรวจ รายการจะแสดงที่หน้านี้อัตโนมัติ</p><button type="button" class="button primary" data-defect-action="audit">ไปกรอกแบบตรวจ</button></div>`}`;
  }

  async function verifyAdminPassword(password) {
    const bytes = new TextEncoder().encode(`${ADMIN_SALT}${password}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return hex === ADMIN_HASH;
  }

  function nextItemId(section, type = adminChecklistType) {
    let sequence = 1;
    const used = new Set(itemsForType(type).map((item) => item.id));
    while (used.has(`${section.id}.${sequence}`)) sequence += 1;
    return `${section.id}.${sequence}`;
  }

  function nextZoneName(site) {
    const numbers = Object.keys(siteZoneLocations[site] || {})
      .map((zone) => Number(zone.match(/^Zone\s+(\d+)$/i)?.[1]))
      .filter(Number.isFinite);
    return `Zone ${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
  }

  async function renderAdmin() {
    if (!isAdmin) {
      els.adminView.innerHTML = `<section class="admin-login-card">
        <div class="admin-lock">▣</div><span class="eyebrow">Restricted area</span><h2>เข้าสู่ระบบผู้ดูแล</h2>
        <p>ผู้ตรวจทั่วไปไม่ต้อง Login ส่วนเมนูนี้ใช้สำหรับจัดการคำถามและข้อมูลระบบบนอุปกรณ์นี้</p>
        <form data-admin-login><label class="field"><span>รหัสผู้ดูแลระบบ</span><input type="password" name="adminPassword" autocomplete="current-password" required placeholder="กรอกรหัส Admin" /></label><button class="button primary" type="submit">เข้าสู่ระบบ Admin</button></form>
        <small class="admin-scope-note">Local Admin · ข้อมูลและการตั้งค่ามีผลเฉพาะเบราว์เซอร์นี้</small>
      </section>`;
      return;
    }
    const audits = await listAudits();
    const adminSections = sectionsForType(adminChecklistType);
    const adminItems = itemsForType(adminChecklistType);
    const findingsTotal = audits.reduce((sum, entry) => sum + itemsForType(entry.meta?.auditType).filter((item) => FINDING_RULES[entry.responses?.[item.id]?.rating]).length, 0);
    let storageText = "กำลังคำนวณ";
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage != null) storageText = `${(estimate.usage / 1024 / 1024).toFixed(1)} MB`;
    } catch (error) { console.error(error); }
    if (currentStep !== "admin") return;
    if (!dashboardZoneScoreDraft.month) dashboardZoneScoreDraft.month = today().slice(0, 7);
    const dashboardSites = [...new Set([...masterData.sites, ...Object.keys(siteZoneLocations)])];
    const dashboardZones = dashboardZoneScoreDraft.site ? Object.keys(siteZoneLocations[dashboardZoneScoreDraft.site] || {}) : [...new Set(Object.values(siteZoneLocations).flatMap((zones) => Object.keys(zones)))];
    const manualZoneSummary = aggregateManualZoneScores();
    const zoneScoreRows = [...dashboardManualData.zoneScores].sort((a, b) => `${b.month}|${b.site}|${b.zone}`.localeCompare(`${a.month}|${a.site}|${a.zone}`, "th", { numeric: true })).map((row) => `<article class="zone-score-record ${row.isNA ? "is-na" : ""}" data-zone-score-id="${escapeHtml(row.id)}"><div><b>${escapeHtml(row.site)} · ${escapeHtml(row.zone)}</b><span>${escapeHtml(formatAuditMonth(row.month))}${row.updatedAt ? ` · บันทึกล่าสุด ${escapeHtml(formatDate(row.updatedAt.slice(0, 10)))}` : ""}</span></div><strong>${row.isNA ? "N/A" : `${displayPercent(Number(row.score))}%`}</strong><small>${row.isNA ? "ไม่รวมคำนวณคะแนน Site" : "นำไปคำนวณ Dashboard"}</small><div><button type="button" class="admin-edit-button" data-admin-action="edit-zone-score">แก้ไข</button><button type="button" class="admin-delete-button" data-admin-action="delete-zone-score">ลบ</button></div></article>`).join("");
    const trendPreview = manualZoneSummary.trendData.map((point) => `<span>${escapeHtml(formatAuditMonthShort(point.month))}<b>${displayPercent(point.average)}%</b><small>${point.count} Zone</small></span>`).join("");
    const sitePreview = manualZoneSummary.siteData.map((point) => `<span>${escapeHtml(point.site)}<b>${displayPercent(point.average)}%</b><small>${point.count} Zone</small></span>`).join("");
    els.adminView.innerHTML = `<div class="admin-heading"><div><span class="eyebrow">Administration</span><h2>ระบบหลังบ้าน</h2><p>จัดการ Checklist และข้อมูลแบบตรวจที่บันทึกบนอุปกรณ์นี้</p></div><button type="button" class="button secondary" data-admin-action="logout">ออกจากระบบ Admin</button></div>
      <section class="admin-metrics"><article><span>หมวดตรวจ</span><strong>${adminSections.length}</strong></article><article><span>คำถามชุดนี้</span><strong>${adminItems.length}</strong></article><article><span>แบบตรวจ</span><strong>${audits.length}</strong></article><article><span>ข้อบกพร่อง</span><strong>${findingsTotal}</strong></article><article><span>พื้นที่จัดเก็บ</span><strong>${storageText}</strong></article></section>
      <section class="admin-master-card admin-dashboard-data-card"><div class="card-heading admin-dashboard-heading"><div><span class="eyebrow">Dashboard data</span><h3>ข้อมูลกราฟ Dashboard</h3><p>บันทึกคะแนนราย Zone แล้วระบบจะคำนวณ Score Trend และ Site Comparison ให้อัตโนมัติ</p></div><label class="dashboard-source-select"><span>แหล่งข้อมูลกราฟ</span><select data-dashboard-source><option value="automatic" ${dashboardManualData.source === "automatic" ? "selected" : ""}>อัตโนมัติจากแบบตรวจ</option><option value="manual" ${dashboardManualData.source === "manual" ? "selected" : ""}>คะแนนราย Zone ที่ Admin บันทึก</option></select></label></div><div class="admin-dashboard-note ${dashboardManualData.source === "manual" ? "manual" : "automatic"}">${dashboardManualData.source === "manual" ? `Dashboard ใช้ ${manualZoneSummary.validRows.length} Zone ที่มีคะแนน · มี N/A ${manualZoneSummary.naCount} Zone ซึ่งไม่นำมาคำนวณค่าเฉลี่ย Site` : "Dashboard จะคำนวณกราฟจากแบบตรวจและตัวกรองโดยอัตโนมัติ ข้อมูลคะแนนราย Zone ที่บันทึกไว้จะยังถูกเก็บรักษา"}</div><section class="zone-score-editor"><header><div><h4>${dashboardZoneScoreDraft.id ? "แก้ไขคะแนนราย Zone" : "เพิ่มคะแนนราย Zone"}</h4><small>พื้นที่ที่ไม่มีการตรวจให้เลือก N/A ระบบจะไม่นำคะแนนนั้นมาคำนวณรวม</small></div></header><datalist id="adminDashboardSites">${dashboardSites.map((site) => `<option value="${escapeHtml(site)}"></option>`).join("")}</datalist><datalist id="adminDashboardZones">${dashboardZones.map((zone) => `<option value="${escapeHtml(zone)}"></option>`).join("")}</datalist><div class="zone-score-form"><label><span>ประจำเดือน</span><input type="month" data-zone-score-draft="month" value="${escapeHtml(dashboardZoneScoreDraft.month)}" /></label><label><span>Site</span><input list="adminDashboardSites" data-zone-score-draft="site" value="${escapeHtml(dashboardZoneScoreDraft.site)}" placeholder="เลือกหรือพิมพ์ Site" /></label><label><span>Zone</span><input list="adminDashboardZones" data-zone-score-draft="zone" value="${escapeHtml(dashboardZoneScoreDraft.zone)}" placeholder="เลือกหรือพิมพ์ Zone" /></label><label><span>คะแนน (%)</span><input type="number" min="0" max="100" step="0.1" data-zone-score-draft="score" value="${escapeHtml(dashboardZoneScoreDraft.score)}" placeholder="0–100" ${dashboardZoneScoreDraft.isNA ? "disabled" : ""} /></label><label class="zone-score-na"><input type="checkbox" data-zone-score-na ${dashboardZoneScoreDraft.isNA ? "checked" : ""} /><span>ไม่มีการตรวจ (N/A)</span></label><div class="zone-score-form-actions"><button type="button" class="button primary" data-admin-action="save-zone-score">${dashboardZoneScoreDraft.id ? "บันทึกการแก้ไข" : "บันทึกคะแนน"}</button>${dashboardZoneScoreDraft.id ? `<button type="button" class="button secondary" data-admin-action="cancel-zone-score">ยกเลิก</button>` : ""}</div></div></section><div class="zone-score-list">${zoneScoreRows || `<div class="dashboard-empty compact">ยังไม่มีคะแนนราย Zone ที่บันทึก</div>`}</div><div class="admin-dashboard-data-grid"><section class="admin-chart-editor score-trend-editor"><header><div><h4>Score Trend</h4><small>คำนวณจากคะแนน Zone รายเดือน · ไม่นับ N/A</small></div></header><div class="admin-calculation-preview">${trendPreview || `<div class="dashboard-empty compact">ยังไม่มีข้อมูลสำหรับคำนวณ</div>`}</div></section><section class="admin-chart-editor finding-mix-editor"><header><div><h4>Finding Mix</h4><small>จำนวนข้อบกพร่องแยกตามระดับ</small></div><button type="button" data-admin-action="save-finding-mix">บันทึก</button></header><div class="admin-finding-inputs">${["major", "minor", "observe"].map((rating) => `<label class="${rating}"><span>${FINDING_RULES[rating].label}</span><input type="number" min="0" step="1" data-finding-mix="${rating}" value="${escapeHtml(dashboardManualData.findingMix[rating])}" placeholder="0" /></label>`).join("")}</div></section><section class="admin-chart-editor site-comparison-editor"><header><div><h4>Site Comparison</h4><small>ค่าเฉลี่ยคะแนน Zone ของแต่ละ Site · ไม่นับ N/A</small></div></header><div class="admin-calculation-preview site-preview">${sitePreview || `<div class="dashboard-empty compact">ยังไม่มีข้อมูลสำหรับคำนวณ</div>`}</div></section></div></section>
      <section class="admin-checklist-picker"><label class="field"><span>เลือกชุดคำถามที่ต้องการจัดการ</span><select data-admin-checklist-type>${Object.entries(checklistSets).map(([type, checklist]) => `<option value="${escapeHtml(type)}" ${adminChecklistType === type ? "selected" : ""}>${escapeHtml(checklist.label)} · ${itemsForType(type).length} ข้อ</option>`).join("")}</select></label></section>
      <section class="admin-toolbar"><div><h3>จัดการคำถาม · ${escapeHtml(auditTypeLabel(adminChecklistType))}</h3><p>แก้ข้อความ เพิ่ม หรือลบคำถามในชุดที่เลือกได้ทันที</p></div><div><button type="button" class="button secondary" data-admin-action="export">สำรองข้อมูลระบบ</button><button type="button" class="button secondary" data-admin-action="reset">คืนคำถามเริ่มต้น</button><button type="button" class="button primary" data-admin-action="add-section">+ เพิ่มหมวด</button></div></section>
      <section class="admin-master-card"><div class="card-heading"><div><span class="eyebrow">Master data</span><h3>ตัวเลือกข้อมูลการตรวจประเมิน</h3><p>รายการ Site จะแสดงเสมอ ส่วนแผนกและพื้นที่ชุดนี้ใช้สำหรับ Site อื่นที่ไม่ใช่โรงงานเทพารักษ์</p></div></div><div class="admin-master-grid">${Object.keys(MASTER_LABELS).map((key) => `<section data-master-key="${key}"><header><h4>${MASTER_LABELS[key]}</h4><button type="button" data-admin-action="add-master">+ เพิ่ม</button></header><div>${masterData[key].map((value, index) => `<label data-master-index="${index}"><input data-master-value value="${escapeHtml(value)}" aria-label="${MASTER_LABELS[key]} ${index + 1}" /><button type="button" class="admin-delete-button" data-admin-action="delete-master">ลบ</button></label>`).join("")}</div></section>`).join("")}</div></section>
      ${[...new Set([...masterData.sites, ...Object.keys(siteZoneLocations)])].map((site) => { const zones = siteZoneLocations[site] || {}; return `<section class="admin-master-card admin-zone-card" data-zone-site="${escapeHtml(site)}"><div class="card-heading"><div><span class="eyebrow">Site zones</span><h3>Zone Location · ${escapeHtml(site)}</h3><p>เพิ่ม Zone เลือกชุดคำถาม และแก้ไขรายการพื้นที่ตรวจของโรงงานนี้</p></div><button type="button" class="button primary" data-admin-action="add-zone">+ เพิ่ม Zone</button></div><div class="admin-master-grid">${Object.entries(zones).map(([zone, locations]) => `<section data-zone-key="${escapeHtml(zone)}"><header><h4>${escapeHtml(zone)}</h4><div class="admin-zone-actions"><button type="button" data-admin-action="add-zone-location">+ เพิ่มพื้นที่</button><button type="button" class="zone-delete-button" data-admin-action="delete-zone">ลบ Zone</button></div></header><label class="zone-checklist-field"><span>ชุดคำถามสำหรับ Zone นี้</span><select data-zone-checklist-type aria-label="ชุดคำถาม ${escapeHtml(site)} ${escapeHtml(zone)}">${Object.entries(checklistSets).map(([type, checklist]) => `<option value="${escapeHtml(type)}" ${siteZoneChecklistTypes[site]?.[zone] === type ? "selected" : ""}>${escapeHtml(checklist.label)}</option>`).join("")}</select></label><div>${locations.map((value, index) => `<label data-zone-index="${index}"><input data-zone-location-value value="${escapeHtml(value)}" aria-label="${escapeHtml(site)} ${escapeHtml(zone)} พื้นที่ ${index + 1}" /><button type="button" class="admin-delete-button" data-admin-action="delete-zone-location">ลบ</button></label>`).join("")}</div></section>`).join("") || `<div class="dashboard-empty compact admin-zone-empty">ยังไม่มี Zone ใน Site นี้</div>`}</div></section>`; }).join("")}
      <div class="admin-section-list">${adminSections.map((section, sectionIndex) => `<section class="admin-section" data-admin-section="${sectionIndex}"><header><label class="field"><span>ชื่อหมวด ${section.id}</span><input data-section-title value="${escapeHtml(section.title)}" /></label><div><b>${section.items.length} คำถาม</b><button type="button" class="admin-delete-button" data-admin-action="delete-section">ลบหมวด</button></div></header><div class="admin-question-list">${section.items.map((item, itemIndex) => `<article class="admin-question" data-admin-item="${itemIndex}"><span class="item-code">${escapeHtml(item.id)}</span><textarea data-question-text aria-label="คำถาม ${escapeHtml(item.id)}">${escapeHtml(item.text)}</textarea><button type="button" class="admin-delete-button" data-admin-action="delete-question">ลบ</button></article>`).join("")}</div><button type="button" class="admin-add-question" data-admin-action="add-question">+ เพิ่มคำถามในหมวดนี้</button></section>`).join("")}</div>
      <section class="admin-data-card"><div class="card-heading"><div><span class="eyebrow">Audit data</span><h3>ข้อมูลแบบตรวจบนอุปกรณ์</h3></div></div><div class="admin-audit-list">${audits.length ? audits.map((entry) => { const stats = entryStats(entry); return `<article data-admin-audit="${escapeHtml(entry.id)}"><div><b>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")}</b><span>${escapeHtml(auditTypeLabel(entry.meta?.auditType))} · ${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${escapeHtml(entry.meta?.department || "—")} · ${escapeHtml(formatDate(entry.meta?.auditDate))}</span></div><div><strong>${stats.answered}/${stats.total}</strong><span>${entry.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</span></div><button type="button" class="admin-delete-button" data-admin-action="delete-audit">ลบข้อมูล</button></article>`; }).join("") : `<div class="dashboard-empty compact">ยังไม่มีข้อมูลแบบตรวจ</div>`}</div></section>`;
  }

  function invalidateSectionConfirmation(sectionId) {
    if (!audit.sectionConfirmations?.[sectionId]) return;
    delete audit.sectionConfirmations[sectionId];
  }

  async function confirmSectionAndAdvance(sectionId) {
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section) return;
    const firstMissing = section.items.find((item) => !responseFor(item.id).rating);
    if (firstMissing) {
      searchTerm = "";
      findingsOnly = false;
      els.itemSearch.value = "";
      els.findingFilter.checked = false;
      renderChecklist();
      requestAnimationFrame(() => {
        const missingCard = els.checklist.querySelector(`[data-item-id="${CSS.escape(firstMissing.id)}"]`);
        missingCard?.scrollIntoView({ behavior: "smooth", block: "center" });
        missingCard?.querySelector("[data-rating]")?.focus({ preventScroll: true });
      });
      showToast(`กรุณาตอบข้อ ${firstMissing.id} ก่อนยืนยันหมวด`);
      return;
    }
    if (!audit.sectionConfirmations) audit.sectionConfirmations = {};
    audit.sectionConfirmations[sectionId] = new Date().toISOString();
    await saveNow();
    const sectionIndex = sections.findIndex((entry) => entry.id === sectionId);
    const nextSection = sections[sectionIndex + 1];
    if (!nextSection) {
      navigate("dashboard");
      showToast(`ยืนยันหมวด ${sectionId} แล้ว · ตรวจสอบสรุปผลได้เลย`);
      return;
    }
    navigate(nextSection.id);
    showToast(`ยืนยันหมวด ${sectionId} แล้ว · ไปหมวด ${nextSection.id}`);
  }

  function renderMeta() {
    els.metaView.innerHTML = `
      <div class="welcome-card">
        <span class="eyebrow">KCG Corporation · Quality System</span>
        <h2>พร้อมสำหรับการตรวจรอบใหม่</h2>
        <p>กรอกข้อมูลทั่วไปก่อนเริ่ม ระบบจะบันทึกคำตอบทุกข้อบนอุปกรณ์นี้โดยอัตโนมัติ</p>
      </div>
      <div class="form-card">
        <h3>ข้อมูลการตรวจประเมิน</h3>
        <div class="form-grid">
          <label class="field full audit-type-field"><span>ประเภทแบบตรวจ</span><select data-audit-type ${isZoneSite() ? "disabled" : ""}>${Object.entries(checklistSets).map(([type, checklist]) => `<option value="${escapeHtml(type)}" ${audit.meta.auditType === type ? "selected" : ""}>${escapeHtml(checklist.label)}</option>`).join("")}</select><small>${isZoneSite() ? "ระบบเลือกชุดคำถามให้อัตโนมัติตาม Zone: ไลน์ผลิต, คลังสินค้า หรือพื้นที่รอบนอก" : "เลือกประเภทเพื่อแสดงชุดคำถามที่ตรงกับพื้นที่ตรวจ"}</small></label>
          <label class="field full"><span>ชื่อแบบตรวจ</span><input data-meta="title" value="${escapeHtml(audit.meta.title)}" /></label>
          <label class="field"><span>Site / สถานที่ตั้ง</span><select data-meta="site">${selectOptions(masterData.sites, audit.meta.site || "", "เลือก Site")}</select></label>
          <label class="field"><span>แผนก / Zone</span><select data-meta="department">${selectOptions(departmentOptionsFor(), audit.meta.department || "", isZoneSite() ? "เลือก Zone" : "เลือกแผนก")}</select></label>
          <label class="field"><span>Zone Location / พื้นที่ตรวจ</span><select data-meta="area" ${isZoneSite() && !isZone(audit.meta.department) ? "disabled" : ""}>${selectOptions(areaOptionsFor(), audit.meta.area || "", isZoneSite() ? (isZone(audit.meta.department) ? "เลือก Zone Location" : "กรุณาเลือก Zone ก่อน") : "เลือกพื้นที่")}</select></label>
          <label class="field"><span>ประจำเดือน</span><input type="month" data-meta="auditMonth" value="${escapeHtml(audit.meta.auditMonth)}" /></label>
          <label class="field"><span>วันที่ตรวจ</span><input type="date" data-meta="auditDate" value="${escapeHtml(audit.meta.auditDate)}" /></label>
          <label class="field"><span>Auditor / ผู้ตรวจ</span><input data-meta="auditor" value="${escapeHtml(audit.meta.auditor)}" placeholder="ชื่อผู้ตรวจ" /></label>
          <label class="field"><span>Auditee / ผู้รับการตรวจ</span><input data-meta="auditee" value="${escapeHtml(audit.meta.auditee)}" placeholder="ชื่อผู้รับการตรวจ" /></label>
        </div>
        <div class="form-footer">
          <p>${allItems.length} ข้อ · ${sections.length} หมวด · คะแนนเต็ม ${allItems.length * 2} · ผ่านเมื่อได้ตั้งแต่ ${PASS_THRESHOLD}%</p>
          <button class="button primary" id="startAuditButton" type="button">เริ่มทำแบบตรวจ →</button>
        </div>
      </div>`;
    els.metaView.querySelector("[data-audit-type]").addEventListener("change", async (event) => {
      const nextType = event.target.value;
      const previousType = audit.meta.auditType || "production";
      if (!await changeAuditChecklistType(nextType)) {
        event.target.value = previousType;
        return;
      }
      updateAll();
      showToast(`เปลี่ยนเป็นแบบตรวจ ${auditTypeLabel(nextType)} · ${allItems.length} ข้อ`);
    });
    els.metaView.querySelectorAll("[data-meta]").forEach((input) => {
      input.addEventListener("input", async () => {
        const previousMeta = { ...audit.meta };
        const key = input.dataset.meta;
        audit.meta[key] = input.value;
        if (key === "site") {
          if (isZoneSite()) {
            if (!isZone(audit.meta.department)) audit.meta.department = "";
            if (!areaOptionsFor().includes(audit.meta.area)) audit.meta.area = "";
          } else {
            if (isAnyZone(audit.meta.department)) audit.meta.department = "";
            if (allZoneLocations().includes(audit.meta.area)) audit.meta.area = "";
          }
        }
        if (key === "department" && isZoneSite() && !areaOptionsFor().includes(audit.meta.area)) {
          audit.meta.area = "";
        }
        if ((key === "site" || key === "department") && isZoneSite()) {
          const linkedAreas = areaOptionsFor();
          if (linkedAreas.length === 1) audit.meta.area = linkedAreas[0];
        }
        const automaticType = checklistTypeForZone();
        if ((key === "site" || key === "department") && automaticType && automaticType !== audit.meta.auditType) {
          const changed = await changeAuditChecklistType(automaticType, `Zone นี้ใช้แบบตรวจ ${auditTypeLabel(automaticType)} ระบบจะเปลี่ยนชุดคำถามและล้างคำตอบเดิม ต้องการดำเนินการต่อหรือไม่?`);
          if (!changed) {
            audit.meta = previousMeta;
            activateAuditChecklist();
            updateAll({ checklist: false });
            showToast("ยกเลิกการเปลี่ยน Zone");
            return;
          }
          showToast(`เลือกแบบตรวจ ${auditTypeLabel(automaticType)} อัตโนมัติ`);
        }
        audit.status = "draft";
        scheduleSave();
        if (key === "site" || key === "department") updateAll({ checklist: false });
      });
    });
    $("startAuditButton").textContent = missingAuditMeta().length ? "กรอกข้อบกพร่องก่อน →" : "เริ่มกรอกข้อบกพร่อง →";
    $("startAuditButton").addEventListener("click", enterDefectEntry);
  }

  function renderChecklist() {
    const stats = getStats();
    const missingMeta = missingAuditMeta();
    const remaining = stats.total - stats.answered;
    const unansweredWithoutFinding = allItems.filter((item) => {
      const response = responseFor(item.id);
      return !response.rating && !response.note.trim() && !response.photos.length;
    }).length;
    els.sectionEyebrow.textContent = `แบบตรวจทั้งหมด · ${sections.length} หมวด`;
    els.sectionTitle.textContent = "กรอกข้อบกพร่องที่พบก่อน";
    els.sectionSubtitle.textContent = `แสดงข้อกำหนดทั้งหมด ${allItems.length} ข้อในหน้าเดียว`;
    els.sectionScore.innerHTML = `<strong>${stats.score.toFixed(Number.isInteger(stats.score) ? 0 : 1)} / ${stats.maxScore}</strong><span>${stats.answered}/${stats.total} ข้อ · ${displayPercent(stats.percent)}%</span>`;

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th");
    const visibleSections = sections.map((section) => ({
      section,
      items: section.items.filter((item) => {
        const response = responseFor(item.id);
        const matchesSearch = !normalizedSearch || `${item.id} ${item.text}`.toLocaleLowerCase("th").includes(normalizedSearch);
        const matchesFinding = !findingsOnly || (response.rating && response.rating !== "comply");
        return matchesSearch && matchesFinding;
      }),
    })).filter(({ items }) => items.length);

    const scoreProfile = profile();
    const sectionHtml = visibleSections.map(({ section, items }) => {
      const sectionStats = getStats(section.items);
      const itemHtml = items.map((item) => {
        const response = responseFor(item.id);
        const findingEntries = findingEntriesFor(response);
        const activeEntries = activeFindingEntries(response);
        const isFinding = response.rating && response.rating !== "comply";
        const hasFindingDetail = Boolean(response.note.trim() || response.photos.length);
        const missingFindingPhoto = isFinding && (!activeEntries.length || activeEntries.some((entry) => !entry.photos.length));
        const showFindingPanel = defectEntryMode || !response.rating || isFinding || hasFindingDetail;
        return `<article class="check-item" data-item-id="${item.id}">
          <div class="check-main">
            <span class="item-code">${item.id}</span>
            <div>
              <p class="item-text">${escapeHtml(item.text).replace(/\n/g, "<br>")}</p>
              <div class="rating-group" role="radiogroup" aria-label="ผลการตรวจข้อ ${item.id}">
                ${Object.keys(RATING_LABELS).map((rating) => `<button type="button" role="radio" aria-checked="${response.rating === rating}" class="rating-button ${response.rating === rating ? "selected" : ""}" data-rating="${rating}"><i class="dot ${rating}"></i>${RATING_LABELS[rating]} <span class="rating-score">${scoreProfile[rating]}</span></button>`).join("")}
              </div>
            </div>
          </div>
          <div class="finding-panel ${!response.rating ? "pending" : ""} ${missingFindingPhoto ? "photo-required" : ""}" ${showFindingPanel ? "" : "hidden"}>
            <div class="finding-detail-heading"><div><strong>${isFinding ? "รายละเอียดข้อบกพร่อง / สิ่งที่ตรวจพบ" : "พบข้อบกพร่อง? กรอกรายละเอียดได้ทันที"}</strong><small>${isFinding ? "เพิ่มรายละเอียดการพบปัญหาในข้อเดียวกันได้มากกว่า 1 รายการ" : "เมื่อเริ่มกรอก ระบบจะเลือกระดับ Observe ให้อัตโนมัติ"}</small></div><button type="button" class="add-finding-detail" data-add-finding-note>＋ เพิ่มรายการ</button></div>
            <div class="finding-detail-list">${findingEntries.map((entry, entryIndex) => {
              const entryActive = Boolean(entry.note.trim() || entry.photos.length) || (isFinding && entryIndex === 0 && !activeEntries.length);
              const entryMissingPhoto = isFinding && entryActive && !entry.photos.length;
              return `<article class="finding-detail-entry ${entryMissingPhoto ? "missing-photo" : ""}" data-finding-entry="${escapeHtml(entry.id)}"><header><b>รายการข้อบกพร่องที่ ${entryIndex + 1}</b>${findingEntries.length > 1 ? `<button type="button" data-remove-finding-entry aria-label="ลบรายการข้อบกพร่องที่ ${entryIndex + 1}">ลบรายการ</button>` : ""}</header><textarea data-finding-note placeholder="ระบุสิ่งที่พบ ตำแหน่ง และผู้รับผิดชอบ...">${escapeHtml(entry.note)}</textarea><div class="attachment-row"><label class="attach-button camera-button">📷 ถ่ายรูป<input type="file" accept="image/*" capture="environment" data-photo /></label><label class="attach-button file-button">🖼 เลือกรูปจากเครื่อง/ไฟล์<input type="file" accept="image/*" multiple data-photo-file /></label>${entry.photos.map((photo, photoIndex) => `<span class="photo-wrap"><img class="photo-thumb" src="${photo}" alt="รูปแนบข้อ ${item.id} รายการที่ ${entryIndex + 1}" /><button type="button" class="photo-remove" data-photo-remove="${photoIndex}" aria-label="ลบรูป">×</button></span>`).join("")}</div><p class="photo-requirement ${entryMissingPhoto ? "missing" : ""}">${entry.photos.length ? `แนบรูปหลักฐานแล้ว ${entry.photos.length} รูป · สามารถเพิ่มได้อีก` : "รายการข้อบกพร่องต้องแนบรูปอย่างน้อย 1 รูป · สามารถแนบได้หลายรูป"}</p></article>`;
            }).join("")}</div>
            ${!response.rating ? `<button type="button" class="no-finding-button" data-no-finding-item>✓ ไม่พบข้อบกพร่อง — ลง Comply</button>` : ""}
          </div>
        </article>`;
      }).join("");
      return `<section class="checklist-section-block" data-section-id="${section.id}">
        <header><div><span>หมวด ${section.id}</span><h3>${escapeHtml(section.title.replace(/^\d+\.\s*/, ""))}</h3></div><b data-section-summary="${section.id}">${sectionStats.answered}/${sectionStats.total} ข้อ</b></header>
        <div class="checklist-section-items">${itemHtml}</div>
      </section>`;
    }).join("");

    const incompleteMetaBanner = missingMeta.length ? `<section class="audit-meta-reminder">
      <div><strong>ยังกรอกข้อมูลการตรวจไม่ครบ · ใช้ชุดคำถาม ${escapeHtml(auditTypeLabel(audit.meta.auditType))}</strong><span>สามารถกรอกข้อบกพร่องไว้ก่อนได้ · หากชุดคำถามไม่ตรง กรุณาเลือกประเภทแบบตรวจก่อน · ก่อนปิดแบบตรวจ ต้องเพิ่ม ${escapeHtml(missingMeta.map(([, label]) => label).join(", "))}</span></div>
      <button type="button" class="button secondary" data-open-meta>เลือกประเภท / กรอกข้อมูล</button>
    </section>` : "";
    els.checklist.innerHTML = `${incompleteMetaBanner}<section class="quick-audit-bar defect-entry-mode">
      <div><strong>ขั้นตอนที่ 1 · กรอกข้อบกพร่องที่พบ</strong><span>กรอกรายละเอียดหรือแนบรูป ระบบจะบันทึกเป็น Observe อัตโนมัติ และสามารถเปลี่ยนเป็น Minor หรือ Major ได้</span></div>
      <button type="button" class="button secondary" data-mark-remaining-comply ${unansweredWithoutFinding ? "" : "disabled"}>ขั้นตอนที่ 2 · ไม่พบข้อบกพร่องเพิ่มเติม — ลง Comply ที่เหลือ</button>
    </section>${sectionHtml}<section class="section-confirm-row">
      <div><strong data-checklist-status>${remaining ? `เหลือ ${remaining} ข้อที่ยังไม่ลงผล` : "กรอกผลครบทุกข้อแล้ว"}</strong><span>ตรวจข้อบกพร่องให้ครบก่อน แล้วกดลง Comply ให้รายการที่เหลือทั้งหมดเพียงครั้งเดียว</span></div>
      <button type="button" class="button primary" data-mark-remaining-comply ${unansweredWithoutFinding ? "" : "disabled"}>✓ ยืนยันไม่พบข้อบกพร่องเพิ่มเติม และลง Comply ที่เหลือ</button>
    </section>`;
    els.emptyState.hidden = visibleSections.length > 0;
  }

  function refreshChecklistProgress() {
    const stats = getStats();
    const remaining = stats.total - stats.answered;
    els.sectionScore.innerHTML = `<strong>${stats.score.toFixed(Number.isInteger(stats.score) ? 0 : 1)} / ${stats.maxScore}</strong><span>${stats.answered}/${stats.total} ข้อ · ${displayPercent(stats.percent)}%</span>`;
    sections.forEach((section) => {
      const summary = els.checklist.querySelector(`[data-section-summary="${CSS.escape(section.id)}"]`);
      const sectionStats = getStats(section.items);
      if (summary) summary.textContent = `${sectionStats.answered}/${sectionStats.total} ข้อ`;
    });
    const hasUnanswered = allItems.some((item) => {
      const response = responseFor(item.id);
      return !response.rating && !response.note.trim() && !response.photos.length;
    });
    els.checklist.querySelectorAll("[data-mark-remaining-comply]").forEach((button) => { button.disabled = !hasUnanswered; });
    const status = els.checklist.querySelector("[data-checklist-status]");
    if (status) status.textContent = remaining ? `เหลือ ${remaining} ข้อที่ยังไม่ลงผล` : "กรอกผลครบทุกข้อแล้ว";
  }

  function updateSummary() {
    const stats = getStats();
    const completion = Math.round((stats.answered / stats.total) * 100);
    els.progressText.textContent = `${stats.answered} / ${stats.total}`;
    els.progressBar.style.width = `${completion}%`;
    els.progressHint.textContent = stats.answered === stats.total ? "ตอบครบทุกข้อแล้ว" : stats.answered ? `เหลืออีก ${stats.total - stats.answered} ข้อ` : "เริ่มกรอกข้อมูลการตรวจ";
    const scoreText = displayPercent(stats.percent);
    els.overallScore.textContent = scoreText;
    els.mobileScore.textContent = scoreText === "—" ? "—" : `${scoreText}%`;
    Object.entries(stats.counts).forEach(([key, value]) => { $(`count${key[0].toUpperCase()}${key.slice(1)}`).textContent = value; });
    if (!stats.answered) {
      els.resultBadge.className = "result-badge neutral";
      els.resultBadge.textContent = "ยังไม่เริ่ม";
    } else if (stats.answered < stats.total) {
      els.resultBadge.className = "result-badge neutral";
      els.resultBadge.textContent = `กำลังตรวจ · ${completion}%`;
    } else if (stats.percent >= PASS_THRESHOLD) {
      els.resultBadge.className = "result-badge pass";
      els.resultBadge.textContent = "ผ่านเกณฑ์";
    } else {
      els.resultBadge.className = "result-badge fail";
      els.resultBadge.textContent = "ไม่ผ่านเกณฑ์";
    }
    if (currentStep === "dashboard") els.mobileNextButton.textContent = "กรอกแบบตรวจ";
    else if (currentStep === "defects") els.mobileNextButton.textContent = "กลับ Dashboard";
    else if (currentStep === "admin") els.mobileNextButton.textContent = "กลับ Dashboard";
    else if (currentStep === "checklist") els.mobileNextButton.textContent = "กลับ Dashboard";
    else els.mobileNextButton.textContent = currentStep === "meta" ? "เริ่มกรอกข้อบกพร่อง" : "กลับ Dashboard";
  }

  function updateAll({ checklist = true } = {}) {
    renderNav();
    if (currentStep === "dashboard") renderDashboard();
    else if (currentStep === "meta") renderMeta();
    else if (currentStep === "defects") renderDefects();
    else if (currentStep === "admin") renderAdmin();
    else if (checklist) renderChecklist();
    updateSummary();
  }
  function navigate(step) {
    if (step !== "checklist") defectEntryMode = false;
    currentStep = step;
    searchTerm = "";
    findingsOnly = false;
    els.itemSearch.value = "";
    els.findingFilter.checked = false;
    els.dashboardView.hidden = step !== "dashboard";
    els.metaView.hidden = step !== "meta";
    els.defectsView.hidden = step !== "defects";
    els.adminView.hidden = step !== "admin";
    els.checklistView.hidden = ["dashboard", "meta", "defects", "admin"].includes(step);
    updateAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterDefectEntry() {
    const hasMissingMeta = missingAuditMeta().length > 0;
    defectEntryMode = true;
    navigate("checklist");
    showToast(hasMissingMeta ? "กรอกข้อบกพร่องไว้ก่อนได้ แล้วกลับมาเติมข้อมูลการตรวจภายหลัง" : "กรอกข้อบกพร่องที่พบก่อน แล้วลง Comply ให้รายการที่เหลือครั้งเดียว");
  }

  async function compressImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    const max = 1280;
    const ratio = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.76);
  }

  function safeFilename(extension) {
    const area = (audit.meta.area || "GHP-Audit").replace(/[\\/:*?"<>|]+/g, "-").trim();
    const type = auditTypeLabel(audit.meta.auditType).replace(/[\\/:*?"<>|]+/g, "-").trim();
    return `GHP-${type}-${area}-${audit.meta.auditDate || today()}.${extension}`;
  }
  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function auditExportRows() {
    const rows = [
      ["KCG GHP Audit Report"],
      ["ประเภทแบบตรวจ", auditTypeLabel(audit.meta.auditType)],
      ["Site", audit.meta.site || "", "แผนก/Zone", audit.meta.department, "Zone Location/พื้นที่ตรวจ", audit.meta.area],
      ["วันที่ตรวจ", audit.meta.auditDate, "Auditor", audit.meta.auditor, "Auditee", audit.meta.auditee],
      [],
      ["หมวด", "ข้อ", "สิ่งที่ต้องตรวจสอบ", "ผลการตรวจ", "คะแนน", "ข้อค้นพบ", "จำนวนรูปหลักฐาน", "ผู้รับผิดชอบ", "กำหนดเสร็จ", "สถานะแก้ไข", "การแก้ไขและป้องกัน", "จำนวนรูปหลังแก้ไข"],
    ];
    sections.forEach((section) => section.items.forEach((item) => {
      const response = responseFor(item.id);
      rows.push([sectionShortTitle(section), item.id, item.text, response.rating ? RATING_LABELS[response.rating] : "", response.rating ? profile()[response.rating] : "", response.note, response.photos?.length || 0, response.responsibility, response.targetDate, ACTION_STATUS_LABELS[response.actionStatus] || "", response.correctiveAction, response.closurePhotos?.length || 0]);
    }));
    const stats = getStats();
    rows.push([], ["รวม", "", "", "", stats.score, "คะแนน (%)", displayPercent(stats.percent)]);
    return rows;
  }
  function exportCsv() {
    const rows = auditExportRows();
    downloadBlob(`\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, safeFilename("csv"), "text/csv;charset=utf-8");
    showToast("ดาวน์โหลด CSV แล้ว");
  }
  function exportExcel() {
    const rows = auditExportRows();
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"Tahoma",sans-serif}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:6px;vertical-align:top}tr:first-child td{font-size:18px;font-weight:bold;color:#b81e18;background:#fff0ee}tr:nth-child(6) td{font-weight:bold;background:#eee}</style></head><body><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    downloadBlob(`\ufeff${html}`, safeFilename("xls"), "application/vnd.ms-excel;charset=utf-8");
    showToast("ดาวน์โหลดรายงาน Excel แล้ว");
  }
  function exportJson() {
    downloadBlob(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), audit }, null, 2), safeFilename("json"), "application/json;charset=utf-8");
    showToast("ดาวน์โหลดไฟล์สำรองแล้ว");
  }
  function richReportDocument() {
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>KCG GHP Audit Report</title><style>
      @page{size:A4;margin:12mm}body{margin:0;color:#202226;font:10pt Arial,"Tahoma",sans-serif;line-height:1.45}h1{margin:0;color:#b81e18;font-size:22pt}h2{margin:16px 0 7px;font-size:14pt}h3{font-size:12pt}.print-header{border-bottom:3px solid #db241c;padding-bottom:10px}.print-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.print-meta>div,.print-summary>div{padding:7px;border:1px solid #ccc}.print-meta span{color:#666}.print-summary{display:flex;gap:8px;margin:10px 0}.print-summary>div{flex:1;background:#fff0ee}.print-section{break-inside:auto}.print-table{width:100%;border-collapse:collapse}.print-table th,.print-table td{border:1px solid #aaa;padding:5px;vertical-align:top}.print-table th,.print-section>h2{background:#f6e1df}.print-findings{break-before:page}.print-finding-group>header{padding:7px;border-left:5px solid #db241c;background:#f2f2f2}.print-finding-card{break-inside:avoid;border:1px solid #aaa;padding:10px;margin-bottom:9px}.print-finding-meta{display:flex;justify-content:space-between}.print-finding-description{border-top:1px solid #ddd;margin-top:7px;padding-top:7px}.print-corrective{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:8px;background:#fafafa;border:1px solid #bbb}.print-corrective .full{grid-column:1/-1}.print-photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.print-photo-grid figure{margin:0;border:1px solid #bbb;padding:5px}.print-photo-grid img{width:100%;height:230px;object-fit:contain}.print-photo-grid figcaption{text-align:center;color:#666;font-size:8pt}.print-photo-count{display:block;color:#b81e18;font-weight:bold}.print-checklist-heading{break-before:page;border-bottom:3px solid #db241c;padding-bottom:6px}
    </style></head><body>${els.printReport.innerHTML}</body></html>`;
  }
  async function exportRichReport(format) {
    await preparePrint();
    const html = richReportDocument();
    if (format === "word") {
      downloadBlob(`\ufeff${html}`, safeFilename("doc"), "application/msword;charset=utf-8");
      showToast("ดาวน์โหลดรายงาน Word แล้ว");
      return;
    }
    downloadBlob(html, safeFilename("html"), "text/html;charset=utf-8");
    showToast("ดาวน์โหลดรายงาน HTML แล้ว");
  }
  function prepareBlankPrint() {
    els.printReport.className = "print-report blank-print-report";
    els.printReport.innerHTML = `
      <header class="print-header blank-print-header">
        <h1>KCG GHP Audit Report</h1>
        <div>KCG Corporation Public Company Limited · Quality System Dept.</div>
        <h2>${escapeHtml(DEFAULT_AUDIT_TITLE)}</h2>
        <p>แบบฟอร์มเปล่าสำหรับบันทึกผลการตรวจประเมิน · ${escapeHtml(auditTypeLabel(audit.meta.auditType))}</p>
      </header>
      <div class="print-meta blank-print-meta">
        <div><span>ประเภทแบบตรวจ</span><b>${escapeHtml(auditTypeLabel(audit.meta.auditType))}</b></div>
        <div><span>Site / สถานที่ตั้ง</span><div class="blank-line"></div></div>
        <div><span>แผนก / Zone</span><div class="blank-line"></div></div>
        <div><span>Zone Location / พื้นที่ตรวจ</span><div class="blank-line"></div></div>
        <div><span>ประจำเดือน</span><div class="blank-line"></div></div>
        <div><span>วันที่ตรวจ</span><div class="blank-line"></div></div>
        <div><span>Auditor / ผู้ตรวจ</span><div class="blank-line"></div></div>
        <div><span>Auditee / ผู้รับการตรวจ</span><div class="blank-line"></div></div>
      </div>
      <div class="blank-print-instruction"><b>วิธีบันทึกผล:</b> ทำเครื่องหมาย ✓ เพียงหนึ่งช่องต่อข้อ และระบุรายละเอียดในช่องข้อค้นพบเมื่อเลือก Observe, Minor หรือ Major · เกณฑ์ผ่าน ${PASS_THRESHOLD}%</div>
      <h2 class="print-checklist-heading">รายการตรวจประเมิน GHP (${allItems.length} ข้อ)</h2>
      ${sections.map((section) => `<section class="print-section blank-print-section"><h2>${escapeHtml(section.title)}</h2><table class="print-table blank-print-table"><thead><tr><th class="print-code">ข้อ</th><th>สิ่งที่ต้องตรวจสอบ</th>${Object.values(RATING_LABELS).map((label) => `<th class="blank-rating">${label}</th>`).join("")}<th class="blank-note">ข้อค้นพบ / หมายเหตุ</th></tr></thead><tbody>${section.items.map((item) => `<tr><td class="blank-code">${escapeHtml(item.id)}</td><td>${escapeHtml(item.text).replace(/\n/g,"<br>")}</td>${Object.keys(RATING_LABELS).map(() => `<td class="blank-check">□</td>`).join("")}<td class="blank-note-cell">&nbsp;</td></tr>`).join("")}</tbody></table></section>`).join("")}
      <footer class="blank-signatures">
        <div><span>ลงชื่อผู้ตรวจ (Auditor)</span><i></i><small>วันที่</small><i class="date-line"></i></div>
        <div><span>ลงชื่อผู้รับการตรวจ (Auditee)</span><i></i><small>วันที่</small><i class="date-line"></i></div>
      </footer>`;
  }
  async function preparePrint() {
    els.printReport.className = "print-report";
    const stats = getStats();
    const result = stats.answered === stats.total ? (stats.percent >= PASS_THRESHOLD ? "ผ่าน" : "ไม่ผ่าน") : "ยังไม่ครบ";
    const findings = getFindings();
    const findingProfiles = ["major", "minor", "observe"].map((rating) => ({ rating, ...FINDING_RULES[rating] }));
    const findingsReport = findings.length ? `<section class="print-findings">
      <div class="print-findings-title"><h2>Defect / ข้อค้นพบจากการตรวจประเมิน</h2><p>จัดกลุ่มตามระดับ Major, Minor และ Observe อ้างอิงรูปแบบรายงานต้นฉบับ</p></div>
      ${findingProfiles.map((findingProfile) => {
        const entries = findings.filter(({ response }) => response.rating === findingProfile.rating);
        if (!entries.length) return "";
        return `<section class="print-finding-group" data-rating="${findingProfile.rating}">
          <header><h3>${findingProfile.label} <span>${entries.length} ข้อ</span></h3><p>ต้องปรับปรุงแก้ไขให้แล้วเสร็จภายใน ${findingProfile.deadline}</p></header>
          ${entries.map(({ item, response, section }, entryIndex) => `<article class="print-finding-card">
            <div class="print-finding-meta"><b>${entryIndex + 1}. Requirement ${escapeHtml(item.id)}</b><span>${escapeHtml(audit.meta.site || "ยังไม่ระบุ Site")} · ${escapeHtml(sectionShortTitle(section))} · ${escapeHtml(audit.meta.area || "ยังไม่ระบุพื้นที่")}</span></div>
            ${activeFindingEntries(response).map((findingEntry, detailIndex) => `<section class="print-finding-detail"><div class="print-finding-description"><span>Description / Evidence · รายการที่ ${detailIndex + 1}</span><p>${escapeHtml(findingEntry.note || "ไม่ได้ระบุรายละเอียด")}</p></div>${findingEntry.photos.length ? `<h4 class="print-photo-label">รูปหลักฐานรายการที่ ${detailIndex + 1}</h4><div class="print-photo-grid">${findingEntry.photos.map((photo, photoIndex) => `<figure><img src="${escapeHtml(photo)}" alt="รูปหลักฐานข้อ ${escapeHtml(item.id)} รายการที่ ${detailIndex + 1} รูปที่ ${photoIndex + 1}" /><figcaption>รายการ ${detailIndex + 1} · รูป ${photoIndex + 1}</figcaption></figure>`).join("")}</div>` : `<p class="print-no-photo">ไม่มีรูปหลักฐานแนบ</p>`}</section>`).join("")}
            <div class="print-corrective">
              <div><span>ผู้รับผิดชอบ</span><b>${escapeHtml(response.responsibility || "—")}</b></div>
              <div><span>กำหนดเสร็จ</span><b>${escapeHtml(response.targetDate ? formatDate(response.targetDate) : "—")}</b></div>
              <div><span>สถานะ</span><b>${escapeHtml(ACTION_STATUS_LABELS[response.actionStatus] || ACTION_STATUS_LABELS.open)}</b></div>
              <div class="full"><span>Corrective / Preventive Action</span><p>${escapeHtml(response.correctiveAction || "ยังไม่ได้ระบุการแก้ไข")}</p></div>
            </div>
            ${(response.closurePhotos || []).length ? `<h4 class="print-photo-label closure">รูปหลังแก้ไข</h4><div class="print-photo-grid">${response.closurePhotos.map((photo, photoIndex) => `<figure><img src="${escapeHtml(photo)}" alt="รูปหลังแก้ไขข้อ ${escapeHtml(item.id)} รูปที่ ${photoIndex + 1}" /><figcaption>รูปหลังแก้ไข ${photoIndex + 1}</figcaption></figure>`).join("")}</div>` : `<p class="print-no-photo">ไม่มีรูปหลังแก้ไขแนบ</p>`}
          </article>`).join("")}
        </section>`;
      }).join("")}
    </section>` : "";
    els.printReport.innerHTML = `
      <header class="print-header"><h1>KCG GHP Audit Report</h1><div>KCG Corporation Public Company Limited · Quality System Dept.</div></header>
      <div class="print-meta">
        <div><span>ประเภทแบบตรวจ</span><br><b>${escapeHtml(auditTypeLabel(audit.meta.auditType))}</b></div>
        <div><span>Site</span><br><b>${escapeHtml(audit.meta.site || "—")}</b></div>
        <div><span>แผนก / Zone</span><br><b>${escapeHtml(audit.meta.department || "—")}</b></div>
        <div><span>Zone Location / พื้นที่ตรวจ</span><br><b>${escapeHtml(audit.meta.area || "—")}</b></div>
        <div><span>วันที่ตรวจ</span><br><b>${escapeHtml(formatDate(audit.meta.auditDate))}</b></div>
        <div><span>Auditor</span><br><b>${escapeHtml(audit.meta.auditor || "—")}</b></div>
        <div><span>Auditee</span><br><b>${escapeHtml(audit.meta.auditee || "—")}</b></div>
        <div><span>เกณฑ์คะแนน</span><br><b>${escapeHtml(profile().label)}</b></div>
      </div>
      <div class="print-summary"><div>ตอบแล้ว<br><b>${stats.answered}/${stats.total}</b></div><div>คะแนน<br><b>${stats.score}/${stats.maxScore}</b></div><div>คิดเป็น<br><b>${displayPercent(stats.percent)}%</b></div><div>ผลประเมิน<br><b>${result}</b></div></div>
      ${findingsReport}
      <h2 class="print-checklist-heading">รายละเอียด Checklist ทั้งหมด</h2>
      ${sections.map((section) => `<section class="print-section"><h2>${escapeHtml(section.title)}</h2><table class="print-table"><thead><tr><th class="print-code">ข้อ</th><th>สิ่งที่ต้องตรวจสอบ</th><th class="print-rating">ผล</th><th class="print-note">ข้อค้นพบ</th></tr></thead><tbody>${section.items.map((item) => { const response = responseFor(item.id); const photoCount = response.photos?.length || 0; const closureCount = response.closurePhotos?.length || 0; return `<tr><td>${item.id}</td><td>${escapeHtml(item.text).replace(/\n/g,"<br>")}</td><td class="print-rating">${response.rating ? RATING_LABELS[response.rating] : "—"}</td><td>${escapeHtml(response.note || "").replace(/\n/g,"<br>")}${photoCount ? `<small class="print-photo-count">รูปหลักฐาน ${photoCount} รูป</small>` : ""}${closureCount ? `<small class="print-photo-count">รูปหลังแก้ไข ${closureCount} รูป</small>` : ""}</td></tr>`; }).join("")}</tbody></table></section>`).join("")}`;
    const printImages = [...els.printReport.querySelectorAll("img")];
    await Promise.all(printImages.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  }

  async function showHistory() {
    const audits = await listAudits();
    els.historyList.innerHTML = audits.length ? audits.map((entry) => {
      const entrySummary = entryStats(entry);
      return `<article class="history-item ${entry.id === audit.id ? "active" : ""}" data-history-id="${entry.id}"><div><h4>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")} · ${escapeHtml(entry.meta?.department || "—")}</h4><p>${escapeHtml(auditTypeLabel(entry.meta?.auditType))} · ${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${formatDate(entry.meta?.auditDate)} · ${entrySummary.answered}/${entrySummary.total} ข้อ · ${entry.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</p></div><div class="history-actions"><button type="button" data-history-open>เปิด</button><button type="button" data-history-delete>ลบ</button></div></article>`;
    }).join("") : `<div class="history-empty">ยังไม่มีแบบตรวจที่บันทึกไว้</div>`;
    els.historyDialog.showModal();
  }

  async function completeAudit() {
    const missingMeta = missingAuditMeta();
    if (missingMeta.length) {
      navigate("meta");
      showToast(`กรุณากรอก ${missingMeta.map(([, label]) => label).join(", ")} ก่อนปิดแบบตรวจ`);
      return;
    }
    const stats = getStats();
    if (stats.answered < stats.total) {
      showToast(`ยังเหลือ ${stats.total - stats.answered} ข้อ กรุณาตอบให้ครบ`);
      defectEntryMode = true;
      navigate("checklist");
      return;
    }
    const missingPhotos = allItems.flatMap((item) => {
      const response = responseFor(item.id);
      if (!FINDING_RULES[response.rating]) return [];
      const activeEntries = activeFindingEntries(response);
      if (!activeEntries.length) return [{ item, entry: findingEntriesFor(response)[0] }];
      return activeEntries.filter((entry) => !entry.photos.length).map((entry) => ({ item, entry }));
    });
    if (missingPhotos.length) {
      defectEntryMode = true;
      navigate("checklist");
      requestAnimationFrame(() => {
        const missingCard = els.checklist.querySelector(`[data-item-id="${CSS.escape(missingPhotos[0].item.id)}"]`);
        missingCard?.scrollIntoView({ behavior: "smooth", block: "center" });
        missingCard?.querySelector("[data-photo-file]")?.focus({ preventScroll: true });
      });
      showToast(`มีรายการข้อบกพร่อง ${missingPhotos.length} รายการที่ยังไม่มีรูป กรุณาแนบรูปหลักฐาน`);
      return;
    }
    const missingNotes = allItems.flatMap((item) => {
      const response = responseFor(item.id);
      if (!FINDING_RULES[response.rating]) return [];
      return activeFindingEntries(response).filter((entry) => !entry.note.trim()).map((entry) => ({ item, entry }));
    });
    if (missingNotes.length && !confirm(`มีรายการข้อบกพร่อง ${missingNotes.length} รายการที่ยังไม่มีรายละเอียด ต้องการเสร็จสิ้นต่อหรือไม่?`)) {
      defectEntryMode = true;
      navigate("checklist");
      return;
    }
    audit.status = "complete";
    await saveNow();
    updateAll();
    showToast(`บันทึกผลแล้ว: ${stats.percent >= PASS_THRESHOLD ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์"} ${displayPercent(stats.percent)}%`);
  }

  function bindEvents() {
    els.sectionNav.addEventListener("click", (event) => {
      const navAction = event.target.closest("[data-nav-action]")?.dataset.navAction;
      if (navAction === "print-blank") {
        prepareBlankPrint();
        window.print();
        return;
      }
      if (navAction === "enter-defect") {
        enterDefectEntry();
        return;
      }
      const button = event.target.closest("[data-step]");
      if (button) navigate(button.dataset.step);
    });
    els.homeButton.addEventListener("click", () => navigate("dashboard"));
    els.themeToggle.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
    els.dashboardView.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-dashboard-action]")?.dataset.dashboardAction;
      if (action === "reset-filters") {
        dashboardFilters = { month: "all", site: "all", zone: "all", area: "all", type: "all" };
        renderDashboard();
        return;
      }
      if (action === "audit") navigate("meta");
      if (action === "enter-defect") enterDefectEntry();
      if (action === "defects") navigate("defects");
      if (action === "history") showHistory();
      if (action === "print-blank") { prepareBlankPrint(); window.print(); }
      const recent = event.target.closest("[data-audit-id]");
      const recentAction = event.target.closest("[data-recent-action]")?.dataset.recentAction;
      if (recent && recentAction === "delete") {
        const areaName = recent.querySelector(".recent-audit-open b")?.textContent || "แบบตรวจนี้";
        if (!confirm(`ลบ “${areaName}” ออกจากอุปกรณ์นี้หรือไม่? ข้อมูลและรูปแนบในแบบตรวจนี้จะถูกลบทั้งหมด`)) return;
        await dbRequest("readwrite", (store) => store.delete(recent.dataset.auditId));
        if (recent.dataset.auditId === audit.id) {
          const remaining = await listAudits();
          audit = remaining[0] || createAudit();
          activateAuditChecklist();
        }
        navigate("dashboard");
        showToast("ลบแบบตรวจแล้ว");
        return;
      }
      if (recent && recentAction === "edit") {
        audit = normalizeAudit(await dbRequest("readonly", (store) => store.get(recent.dataset.auditId)));
        activateAuditChecklist();
        navigate("meta");
        showToast("เปิดแบบตรวจสำหรับแก้ไขแล้ว");
        return;
      }
      if (recent && recentAction === "open" && recent.dataset.auditId !== audit.id) {
        audit = normalizeAudit(await dbRequest("readonly", (store) => store.get(recent.dataset.auditId)));
        activateAuditChecklist();
        navigate("dashboard");
        showToast("เปิดแบบตรวจแล้ว");
      }
    });
    els.dashboardView.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-dashboard-filter]");
      if (!filter) return;
      const key = filter.dataset.dashboardFilter;
      if (!Object.prototype.hasOwnProperty.call(dashboardFilters, key)) return;
      dashboardFilters[key] = filter.value;
      if (key === "site") {
        dashboardFilters.zone = "all";
        dashboardFilters.area = "all";
      }
      if (key === "zone") dashboardFilters.area = "all";
      renderDashboard();
    });
    els.itemSearch.addEventListener("input", () => { searchTerm = els.itemSearch.value; renderChecklist(); });
    els.findingFilter.addEventListener("change", () => { findingsOnly = els.findingFilter.checked; renderChecklist(); });
    els.checklist.addEventListener("click", async (event) => {
      if (event.target.closest("[data-open-meta]")) {
        navigate("meta");
        return;
      }
      const markRemainingButton = event.target.closest("[data-mark-remaining-comply]");
      if (markRemainingButton) {
        let marked = 0;
        allItems.forEach((item) => {
          const response = responseFor(item.id);
          if (response.rating || response.note.trim() || response.photos.length) return;
          response.rating = "comply";
          response.autoRatedFromDetail = false;
          marked += 1;
        });
        if (!marked) return;
        audit.sectionConfirmations = {};
        audit.status = "draft";
        scheduleSave();
        updateAll();
        showToast(`ลง Comply อัตโนมัติ ${marked} ข้อที่ไม่พบข้อบกพร่อง`);
        return;
      }
      const itemElement = event.target.closest(".check-item");
      if (!itemElement) return;
      const itemId = itemElement.dataset.itemId;
      const ratingButton = event.target.closest("[data-rating]");
      const noFindingButton = event.target.closest("[data-no-finding-item]");
      const removeButton = event.target.closest("[data-photo-remove]");
      const addFindingNoteButton = event.target.closest("[data-add-finding-note]");
      const removeFindingEntryButton = event.target.closest("[data-remove-finding-entry]");
      if (addFindingNoteButton) {
        const response = responseFor(itemId);
        findingEntriesFor(response).push({ id: uid(), note: "", photos: [] });
        audit.status = "draft";
        scheduleSave();
        renderChecklist();
        requestAnimationFrame(() => {
          const textareas = els.checklist.querySelectorAll(`[data-item-id="${CSS.escape(itemId)}"] [data-finding-note]`);
          textareas[textareas.length - 1]?.focus({ preventScroll: true });
        });
        showToast(`เพิ่มรายการข้อบกพร่องในข้อ ${itemId} แล้ว`);
      } else if (removeFindingEntryButton) {
        const response = responseFor(itemId);
        const entries = findingEntriesFor(response);
        if (entries.length <= 1) return;
        const entryId = removeFindingEntryButton.closest("[data-finding-entry]")?.dataset.findingEntry;
        const entryIndex = entries.findIndex((entry) => entry.id === entryId);
        if (entryIndex < 0) return;
        entries.splice(entryIndex, 1);
        syncFindingEntries(response);
        if (response.autoRatedFromDetail && !response.note.trim() && !response.photos.length) {
          response.rating = null;
          response.autoRatedFromDetail = false;
        }
        audit.status = "draft";
        scheduleSave();
        renderChecklist();
        showToast(`ลบรายการข้อบกพร่องในข้อ ${itemId} แล้ว`);
      } else if (noFindingButton) {
        const response = responseFor(itemId);
        response.rating = "comply";
        response.autoRatedFromDetail = false;
        invalidateSectionConfirmation(currentStep);
        audit.status = "draft";
        scheduleSave();
        updateAll();
        showToast(`ข้อ ${itemId}: ไม่พบข้อบกพร่อง ลง Comply แล้ว`);
      } else if (ratingButton) {
        const response = responseFor(itemId);
        response.rating = ratingButton.dataset.rating;
        response.autoRatedFromDetail = false;
        invalidateSectionConfirmation(currentStep);
        if (FINDING_RULES[response.rating] && !response.targetDate) response.targetDate = suggestedTargetDate(response.rating);
        audit.status = "draft";
        scheduleSave();
        updateAll();
      } else if (removeButton) {
        const response = responseFor(itemId);
        const entryId = removeButton.closest("[data-finding-entry]")?.dataset.findingEntry;
        const entry = findingEntriesFor(response).find((candidate) => candidate.id === entryId);
        if (!entry) return;
        entry.photos.splice(Number(removeButton.dataset.photoRemove), 1);
        syncFindingEntries(response);
        if (response.autoRatedFromDetail && !response.note.trim() && !response.photos.length) {
          response.rating = null;
          response.autoRatedFromDetail = false;
        }
        invalidateSectionConfirmation(currentStep);
        scheduleSave();
        renderChecklist();
      }
    });
    els.checklist.addEventListener("input", (event) => {
      if (!event.target.matches("[data-finding-note]")) return;
      const itemElement = event.target.closest(".check-item");
      const itemId = itemElement.dataset.itemId;
      const response = responseFor(itemId);
      const entryId = event.target.closest("[data-finding-entry]")?.dataset.findingEntry;
      const entry = findingEntriesFor(response).find((candidate) => candidate.id === entryId);
      if (!entry) return;
      entry.note = event.target.value;
      syncFindingEntries(response);
      if (response.note.trim() && (!response.rating || response.rating === "comply")) {
        response.rating = "observe";
        response.autoRatedFromDetail = true;
        if (!response.targetDate) response.targetDate = suggestedTargetDate("observe");
        itemElement.querySelectorAll("[data-rating]").forEach((button) => {
          const selected = button.dataset.rating === "observe";
          button.classList.toggle("selected", selected);
          button.setAttribute("aria-checked", String(selected));
        });
        const panel = itemElement.querySelector(".finding-panel");
        panel?.classList.remove("pending");
        const panelTitle = panel?.querySelector(".finding-detail-heading strong");
        const panelHint = panel?.querySelector(".finding-detail-heading small");
        if (panelTitle) panelTitle.textContent = "รายละเอียดข้อบกพร่อง / สิ่งที่ตรวจพบ";
        if (panelHint) panelHint.textContent = "เพิ่มรายละเอียดการพบปัญหาในข้อเดียวกันได้มากกว่า 1 รายการ";
      } else if (!response.note.trim() && response.autoRatedFromDetail && !response.photos.length) {
        response.rating = null;
        response.autoRatedFromDetail = false;
        itemElement.querySelectorAll("[data-rating]").forEach((button) => {
          button.classList.remove("selected");
          button.setAttribute("aria-checked", "false");
        });
        const panel = itemElement.querySelector(".finding-panel");
        panel?.classList.add("pending");
        const panelTitle = panel?.querySelector(".finding-detail-heading strong");
        const panelHint = panel?.querySelector(".finding-detail-heading small");
        if (panelTitle) panelTitle.textContent = "พบข้อบกพร่อง? กรอกรายละเอียดได้ทันที";
        if (panelHint) panelHint.textContent = "เมื่อเริ่มกรอก ระบบจะเลือกระดับ Observe ให้อัตโนมัติ";
      }
      const entryElement = event.target.closest("[data-finding-entry]");
      const entryMissingPhoto = Boolean(FINDING_RULES[response.rating] && (entry.note.trim() || entry.photos.length) && !entry.photos.length);
      entryElement?.classList.toggle("missing-photo", entryMissingPhoto);
      entryElement?.querySelector(".photo-requirement")?.classList.toggle("missing", entryMissingPhoto);
      itemElement.querySelector(".finding-panel")?.classList.toggle("photo-required", Boolean(FINDING_RULES[response.rating] && activeFindingEntries(response).some((candidate) => !candidate.photos.length)));
      invalidateSectionConfirmation(currentStep);
      audit.status = "draft";
      scheduleSave();
      refreshChecklistProgress();
      renderNav();
      updateSummary();
    });
    els.checklist.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-photo], [data-photo-file]") || !event.target.files?.length) return;
      const itemId = event.target.closest(".check-item").dataset.itemId;
      const entryId = event.target.closest("[data-finding-entry]")?.dataset.findingEntry;
      const files = [...event.target.files];
      try {
        showToast(`กำลังย่อและแนบรูป ${files.length} รูป...`);
        const photos = await Promise.all(files.map(compressImage));
        const response = responseFor(itemId);
        const entry = findingEntriesFor(response).find((candidate) => candidate.id === entryId);
        if (!entry) throw new Error("Finding entry not found");
        entry.photos.push(...photos);
        syncFindingEntries(response);
        if (!response.rating || response.rating === "comply") {
          response.rating = "observe";
          response.autoRatedFromDetail = true;
          if (!response.targetDate) response.targetDate = suggestedTargetDate("observe");
        }
        invalidateSectionConfirmation(currentStep);
        scheduleSave();
        renderChecklist();
        showToast(`แนบรูปแล้ว ${photos.length} รูป`);
      } catch (error) {
        console.error(error);
        showToast("ไม่สามารถแนบรูปที่เลือกได้");
      }
    });
    els.defectsView.addEventListener("click", (event) => {
      if (event.target.closest("[data-defect-action=\"audit\"]")) {
        navigate("meta");
        return;
      }
      const card = event.target.closest("[data-defect-id]");
      const removeButton = event.target.closest("[data-closure-remove]");
      if (!card || !removeButton) return;
      responseFor(card.dataset.defectId).closurePhotos.splice(Number(removeButton.dataset.closureRemove), 1);
      scheduleSave();
      renderDefects();
    });
    els.defectsView.addEventListener("input", (event) => {
      if (!event.target.matches("[data-corrective]")) return;
      const card = event.target.closest("[data-defect-id]");
      if (!card) return;
      responseFor(card.dataset.defectId)[event.target.dataset.corrective] = event.target.value;
      scheduleSave();
    });
    els.defectsView.addEventListener("change", async (event) => {
      const card = event.target.closest("[data-defect-id]");
      if (!card) return;
      const itemId = card.dataset.defectId;
      if (event.target.matches("[data-corrective]")) {
        responseFor(itemId)[event.target.dataset.corrective] = event.target.value;
        scheduleSave();
        if (event.target.dataset.corrective === "actionStatus") updateAll({ checklist: false });
        return;
      }
      if (!event.target.matches("[data-closure-photo], [data-closure-photo-file]") || !event.target.files?.length) return;
      const files = [...event.target.files];
      try {
        showToast(`กำลังย่อและแนบรูปหลังแก้ไข ${files.length} รูป...`);
        const photos = await Promise.all(files.map(compressImage));
        responseFor(itemId).closurePhotos.push(...photos);
        scheduleSave();
        renderDefects();
        showToast(`แนบรูปหลังแก้ไขแล้ว ${photos.length} รูป`);
      } catch (error) {
        console.error(error);
        showToast("ไม่สามารถแนบรูปที่เลือกได้");
      }
    });
    els.adminView.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-admin-login]");
      if (!form) return;
      event.preventDefault();
      const password = new FormData(form).get("adminPassword") || "";
      if (!(await verifyAdminPassword(String(password)))) {
        form.querySelector("input").select();
        showToast("รหัสผู้ดูแลระบบไม่ถูกต้อง");
        return;
      }
      isAdmin = true;
      adminChecklistType = audit.meta.auditType || "production";
      sessionStorage.setItem("ghp-admin-session", "active");
      updateAll({ checklist: false });
      showToast("เข้าสู่ระบบ Admin แล้ว");
    });
    els.adminView.addEventListener("change", (event) => {
      if (!isAdmin) return;
      if (event.target.matches("[data-admin-checklist-type]")) {
        if (!checklistSets[event.target.value]) return;
        adminChecklistType = event.target.value;
        renderAdmin();
        return;
      }
      if (event.target.matches("[data-dashboard-source]")) {
        dashboardManualData.source = event.target.value === "manual" ? "manual" : "automatic";
        scheduleChecklistSave();
        renderAdmin();
        showToast(dashboardManualData.source === "manual" ? "Dashboard จะใช้ข้อมูลที่ Admin กรอก" : "Dashboard จะคำนวณจากแบบตรวจอัตโนมัติ");
        return;
      }
      if (event.target.matches("[data-zone-score-na]")) {
        dashboardZoneScoreDraft.isNA = event.target.checked;
        if (event.target.checked) dashboardZoneScoreDraft.score = "";
        renderAdmin();
        return;
      }
      if (event.target.matches("[data-zone-checklist-type]")) {
        const site = event.target.closest("[data-zone-site]")?.dataset.zoneSite;
        const zone = event.target.closest("[data-zone-key]")?.dataset.zoneKey;
        if (!site || !zone || !checklistSets[event.target.value]) return;
        if (!siteZoneChecklistTypes[site]) siteZoneChecklistTypes[site] = {};
        siteZoneChecklistTypes[site][zone] = event.target.value;
        scheduleChecklistSave();
        showToast(`กำหนด ${zone} ให้ใช้แบบตรวจ ${auditTypeLabel(event.target.value)} แล้ว`);
      }
    });
    els.adminView.addEventListener("input", (event) => {
      if (!isAdmin) return;
      if (event.target.matches("[data-zone-score-draft]")) {
        const field = event.target.dataset.zoneScoreDraft;
        if (["month", "site", "zone", "score"].includes(field)) dashboardZoneScoreDraft[field] = event.target.value;
        return;
      }
      if (event.target.matches("[data-finding-mix]")) {
        const rating = event.target.dataset.findingMix;
        if (["major", "minor", "observe"].includes(rating)) dashboardManualData.findingMix[rating] = event.target.value;
        scheduleChecklistSave();
        return;
      }
      const masterElement = event.target.closest("[data-master-key]");
      if (masterElement && event.target.matches("[data-master-value]")) {
        const key = masterElement.dataset.masterKey;
        const index = Number(event.target.closest("[data-master-index]").dataset.masterIndex);
        if (masterData[key]?.[index] != null) masterData[key][index] = event.target.value;
        scheduleChecklistSave();
        return;
      }
      const zoneElement = event.target.closest("[data-zone-key]");
      if (zoneElement && event.target.matches("[data-zone-location-value]")) {
        const site = event.target.closest("[data-zone-site]")?.dataset.zoneSite;
        const zone = zoneElement.dataset.zoneKey;
        const index = Number(event.target.closest("[data-zone-index]").dataset.zoneIndex);
        if (siteZoneLocations[site]?.[zone]?.[index] != null) siteZoneLocations[site][zone][index] = event.target.value;
        scheduleChecklistSave();
        return;
      }
      const sectionElement = event.target.closest("[data-admin-section]");
      if (!sectionElement) return;
      const sectionIndex = Number(sectionElement.dataset.adminSection);
      const section = sectionsForType(adminChecklistType)[sectionIndex];
      if (!section) return;
      if (event.target.matches("[data-section-title]")) section.title = event.target.value;
      if (event.target.matches("[data-question-text]")) {
        const itemIndex = Number(event.target.closest("[data-admin-item]").dataset.adminItem);
        if (section.items[itemIndex]) section.items[itemIndex].text = event.target.value;
      }
      if (adminChecklistType === activeChecklistType) rebuildItems();
      scheduleChecklistSave();
    });
    els.adminView.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-admin-action]");
      if (!button || !isAdmin) return;
      const action = button.dataset.adminAction;
      const editableSections = sectionsForType(adminChecklistType);
      if (action === "logout") {
        isAdmin = false;
        sessionStorage.removeItem("ghp-admin-session");
        updateAll({ checklist: false });
        showToast("ออกจากระบบ Admin แล้ว");
        return;
      }
      if (action === "export") {
        const audits = await listAudits();
        const payload = { schemaVersion: 8, exportedAt: new Date().toISOString(), checklists: checklistSets, masterData, siteZoneLocations, siteZoneChecklistTypes, dashboardManualData, audits };
        downloadBlob(JSON.stringify(payload, null, 2), `KCG-GHP-System-Backup-${today()}.json`, "application/json;charset=utf-8");
        showToast("ดาวน์โหลดข้อมูลระบบแล้ว");
        return;
      }
      if (action === "reset") {
        if (!confirm("คืนคำถามและตัวเลือกข้อมูลทั้งหมดเป็นค่าเริ่มต้นหรือไม่? ข้อมูลคำตอบเดิมจะยังคงอยู่")) return;
        checklistSets = JSON.parse(JSON.stringify(DEFAULT_CHECKLISTS));
        masterData = JSON.parse(JSON.stringify(DEFAULT_MASTER_DATA));
        siteZoneLocations = JSON.parse(JSON.stringify(DEFAULT_SITE_ZONE_LOCATIONS));
        siteZoneChecklistTypes = JSON.parse(JSON.stringify(DEFAULT_SITE_ZONE_CHECKLIST_TYPES));
        dashboardManualData = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_MANUAL_DATA));
        dashboardZoneScoreDraft = { id: "", month: today().slice(0, 7), site: "", zone: "", score: "", isNA: false };
        activateAuditChecklist();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast("คืนคำถามเริ่มต้นแล้ว");
        return;
      }
      if (action === "save-zone-score") {
        const month = dashboardZoneScoreDraft.month.trim();
        const site = dashboardZoneScoreDraft.site.trim();
        const zone = dashboardZoneScoreDraft.zone.trim();
        const numericScore = Number(dashboardZoneScoreDraft.score);
        if (!/^\d{4}-\d{2}$/.test(month) || !site || !zone) {
          showToast("กรุณาระบุเดือน Site และ Zone ให้ครบ");
          return;
        }
        if (!dashboardZoneScoreDraft.isNA && (dashboardZoneScoreDraft.score === "" || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100)) {
          showToast("กรุณาระบุคะแนนระหว่าง 0–100 หรือเลือก N/A");
          return;
        }
        const savedRow = {
          id: dashboardZoneScoreDraft.id || uid(),
          month,
          site,
          zone,
          score: dashboardZoneScoreDraft.isNA ? "" : String(numericScore),
          isNA: dashboardZoneScoreDraft.isNA,
          updatedAt: new Date().toISOString(),
        };
        let existingIndex = dashboardManualData.zoneScores.findIndex((row) => row.id === savedRow.id);
        if (existingIndex < 0) existingIndex = dashboardManualData.zoneScores.findIndex((row) => row.month === month && row.site.trim() === site && row.zone.trim() === zone);
        if (existingIndex >= 0) savedRow.id = dashboardManualData.zoneScores[existingIndex].id;
        if (existingIndex >= 0) dashboardManualData.zoneScores[existingIndex] = savedRow;
        else dashboardManualData.zoneScores.push(savedRow);
        dashboardManualData.source = "manual";
        dashboardZoneScoreDraft = { id: "", month, site, zone: "", score: "", isNA: false };
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(existingIndex >= 0 ? "บันทึกการแก้ไขคะแนนแล้ว · Dashboard อัปเดตแล้ว" : "บันทึกคะแนนแล้ว · Dashboard อัปเดตแล้ว");
        return;
      }
      if (action === "edit-zone-score") {
        const id = button.closest("[data-zone-score-id]")?.dataset.zoneScoreId;
        const row = dashboardManualData.zoneScores.find((entry) => entry.id === id);
        if (!row) return;
        dashboardZoneScoreDraft = { id: row.id, month: row.month, site: row.site, zone: row.zone, score: row.score, isNA: row.isNA };
        renderAdmin();
        els.adminView.querySelector(".zone-score-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast(`กำลังแก้ไข ${row.site} · ${row.zone}`);
        return;
      }
      if (action === "cancel-zone-score") {
        dashboardZoneScoreDraft = { id: "", month: today().slice(0, 7), site: "", zone: "", score: "", isNA: false };
        renderAdmin();
        showToast("ยกเลิกการแก้ไขแล้ว");
        return;
      }
      if (action === "delete-zone-score") {
        const id = button.closest("[data-zone-score-id]")?.dataset.zoneScoreId;
        const index = dashboardManualData.zoneScores.findIndex((row) => row.id === id);
        const row = dashboardManualData.zoneScores[index];
        if (!row || !confirm(`ลบคะแนน ${row.site} · ${row.zone} · ${formatAuditMonth(row.month)} หรือไม่?`)) return;
        dashboardManualData.zoneScores.splice(index, 1);
        if (dashboardZoneScoreDraft.id === id) dashboardZoneScoreDraft = { id: "", month: today().slice(0, 7), site: "", zone: "", score: "", isNA: false };
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast("ลบคะแนนแล้ว · Dashboard อัปเดตแล้ว");
        return;
      }
      if (action === "save-finding-mix") {
        dashboardManualData.findingMix = normalizeDashboardManualData({ findingMix: dashboardManualData.findingMix }).findingMix;
        dashboardManualData.source = "manual";
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast("บันทึก Finding Mix แล้ว · Dashboard อัปเดตแล้ว");
        return;
      }
      if (action === "add-section") {
        const numericIds = editableSections.map((section) => Number(section.id)).filter(Number.isFinite);
        const id = String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
        editableSections.push({ id, title: `${id}. หมวดใหม่`, weight: 2, items: [{ id: `${id}.1`, text: "คำถามใหม่" }] });
        if (adminChecklistType === activeChecklistType) rebuildItems();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`เพิ่มหมวด ${id} แล้ว`);
        return;
      }
      const masterElement = button.closest("[data-master-key]");
      const masterKey = masterElement?.dataset.masterKey;
      if (action === "add-master" && masterData[masterKey]) {
        masterData[masterKey].push("รายการใหม่");
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`เพิ่มตัวเลือก ${MASTER_LABELS[masterKey]} แล้ว`);
        return;
      }
      if (action === "delete-master" && masterData[masterKey]) {
        const masterIndex = Number(button.closest("[data-master-index]")?.dataset.masterIndex);
        const value = masterData[masterKey][masterIndex];
        if (value == null || !confirm(`ลบตัวเลือก “${value}” หรือไม่?`)) return;
        masterData[masterKey].splice(masterIndex, 1);
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบตัวเลือก ${value} แล้ว`);
        return;
      }
      const zoneElement = button.closest("[data-zone-key]");
      const zoneSite = button.closest("[data-zone-site]")?.dataset.zoneSite;
      const zoneKey = zoneElement?.dataset.zoneKey;
      const editableZoneLocations = siteZoneLocations[zoneSite]?.[zoneKey];
      if (action === "add-zone" && zoneSite) {
        if (!siteZoneLocations[zoneSite]) siteZoneLocations[zoneSite] = {};
        if (!siteZoneChecklistTypes[zoneSite]) siteZoneChecklistTypes[zoneSite] = {};
        const zone = nextZoneName(zoneSite);
        siteZoneLocations[zoneSite][zone] = ["พื้นที่ใหม่"];
        siteZoneChecklistTypes[zoneSite][zone] = "production";
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`เพิ่ม ${zone} ใน ${zoneSite} แล้ว`);
        return;
      }
      if (action === "delete-zone" && editableZoneLocations) {
        if (!confirm(`ลบ ${zoneKey} และรายการพื้นที่ทั้งหมดออกจาก ${zoneSite} หรือไม่?`)) return;
        delete siteZoneLocations[zoneSite][zoneKey];
        if (siteZoneChecklistTypes[zoneSite]) delete siteZoneChecklistTypes[zoneSite][zoneKey];
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบ ${zoneKey} ออกจาก ${zoneSite} แล้ว`);
        return;
      }
      if (action === "add-zone-location" && editableZoneLocations) {
        editableZoneLocations.push("พื้นที่ใหม่");
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`เพิ่มพื้นที่ใน ${zoneSite} · ${zoneKey} แล้ว`);
        return;
      }
      if (action === "delete-zone-location" && editableZoneLocations) {
        const zoneIndex = Number(button.closest("[data-zone-index]")?.dataset.zoneIndex);
        const value = editableZoneLocations[zoneIndex];
        if (value == null || !confirm(`ลบพื้นที่ “${value}” ออกจาก ${zoneSite} · ${zoneKey} หรือไม่?`)) return;
        editableZoneLocations.splice(zoneIndex, 1);
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบพื้นที่ออกจาก ${zoneSite} · ${zoneKey} แล้ว`);
        return;
      }
      const sectionElement = button.closest("[data-admin-section]");
      const sectionIndex = Number(sectionElement?.dataset.adminSection);
      const section = editableSections[sectionIndex];
      if (action === "add-question" && section) {
        const id = nextItemId(section, adminChecklistType);
        section.items.push({ id, text: "คำถามใหม่" });
        section.weight = section.items.length * 2;
        if (adminChecklistType === activeChecklistType) {
          rebuildItems();
          responseFor(id);
          await Promise.all([saveChecklistSettings(), saveNow()]);
        } else {
          await saveChecklistSettings();
        }
        updateAll({ checklist: false });
        showToast(`เพิ่มคำถาม ${id} แล้ว`);
        return;
      }
      if (action === "delete-question" && section) {
        const itemIndex = Number(button.closest("[data-admin-item]")?.dataset.adminItem);
        const item = section.items[itemIndex];
        if (!item || !confirm(`ลบคำถาม ${item.id} ออกจาก Checklist หรือไม่?`)) return;
        section.items.splice(itemIndex, 1);
        section.weight = section.items.length * 2;
        if (adminChecklistType === activeChecklistType) rebuildItems();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบคำถาม ${item.id} แล้ว`);
        return;
      }
      if (action === "delete-section" && section) {
        if (!confirm(`ลบหมวด ${section.id} และคำถามทั้งหมดในหมวดนี้หรือไม่?`)) return;
        editableSections.splice(sectionIndex, 1);
        if (adminChecklistType === activeChecklistType) rebuildItems();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบหมวด ${section.id} แล้ว`);
        return;
      }
      if (action === "delete-audit") {
        const auditElement = button.closest("[data-admin-audit]");
        const auditId = auditElement?.dataset.adminAudit;
        if (!auditId || !confirm("ลบข้อมูลแบบตรวจนี้ออกจากอุปกรณ์หรือไม่?")) return;
        await dbRequest("readwrite", (store) => store.delete(auditId));
        if (audit.id === auditId) {
          const remaining = await listAudits();
          audit = remaining[0] || createAudit();
          activateAuditChecklist();
        }
        updateAll({ checklist: false });
        showToast("ลบข้อมูลแบบตรวจแล้ว");
      }
    });
    els.scoringButton.addEventListener("click", () => {
      els.scoringDialog.querySelector(`[value="${audit.scoringProfile}"]`).checked = true;
      els.scoringDialog.showModal();
    });
    els.scoringDialog.addEventListener("close", () => {
      if (els.scoringDialog.returnValue !== "confirm") return;
      const selected = els.scoringDialog.querySelector("[name=scoreProfile]:checked");
      if (selected) {
        audit.scoringProfile = selected.value;
        audit.status = "draft";
        scheduleSave();
        updateAll();
        showToast(`ใช้เกณฑ์ ${profile().label}`);
      }
    });
    els.exportButton.addEventListener("click", () => els.exportDialog.showModal());
    els.exportDialog.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      if (button.dataset.export === "excel") exportExcel();
      if (button.dataset.export === "csv") exportCsv();
      if (button.dataset.export === "json") exportJson();
      if (button.dataset.export === "word") await exportRichReport("word");
      if (button.dataset.export === "html") await exportRichReport("html");
      if (button.dataset.export === "print") { await preparePrint(); window.print(); }
      els.exportDialog.close();
    });
    els.completeButton.addEventListener("click", completeAudit);
    els.mobileNextButton.addEventListener("click", async () => {
      if (currentStep === "dashboard") navigate("meta");
      else if (currentStep === "defects") navigate("dashboard");
      else if (currentStep === "admin") navigate("dashboard");
      else if (currentStep === "meta") enterDefectEntry();
      else navigate("dashboard");
    });
    els.historyButton.addEventListener("click", showHistory);
    els.historyList.addEventListener("click", async (event) => {
      const item = event.target.closest("[data-history-id]");
      if (!item) return;
      if (event.target.closest("[data-history-open]")) {
        audit = normalizeAudit(await dbRequest("readonly", (store) => store.get(item.dataset.historyId)));
        activateAuditChecklist();
        els.historyDialog.close();
        navigate("dashboard");
        showToast("เปิดแบบตรวจแล้ว");
      }
      if (event.target.closest("[data-history-delete]")) {
        if (!confirm("ลบแบบตรวจนี้ออกจากอุปกรณ์หรือไม่?")) return;
        await dbRequest("readwrite", (store) => store.delete(item.dataset.historyId));
        if (item.dataset.historyId === audit.id) {
          const remaining = await listAudits();
          audit = remaining[0] || createAudit();
          activateAuditChecklist();
          navigate("dashboard");
        }
        showHistory();
      }
    });
    els.newAuditButton.addEventListener("click", async () => {
      audit = createAudit();
      activateAuditChecklist();
      els.historyDialog.close();
      navigate("meta");
      showToast("สร้างแบบตรวจใหม่แล้ว");
    });
  }

  async function init() {
    Object.assign(els, {
      homeButton: $("homeButton"), historyButton: $("historyButton"), themeToggle: $("themeToggle"), saveStatus: $("saveStatus"),
      progressText: $("progressText"), progressBar: $("progressBar"), progressHint: $("progressHint"),
      sectionNav: $("sectionNav"), scoringButton: $("scoringButton"), dashboardView: $("dashboardView"), metaView: $("metaView"), checklistView: $("checklistView"), defectsView: $("defectsView"), adminView: $("adminView"),
      sectionEyebrow: $("sectionEyebrow"), sectionTitle: $("sectionTitle"), sectionSubtitle: $("sectionSubtitle"), sectionScore: $("sectionScore"),
      itemSearch: $("itemSearch"), findingFilter: $("findingFilter"), checklist: $("checklist"), emptyState: $("emptyState"),
      overallScore: $("overallScore"), resultBadge: $("resultBadge"), exportButton: $("exportButton"), completeButton: $("completeButton"),
      mobileScore: $("mobileScore"), mobileNextButton: $("mobileNextButton"), exportDialog: $("exportDialog"), scoringDialog: $("scoringDialog"),
      historyDialog: $("historyDialog"), historyList: $("historyList"), newAuditButton: $("newAuditButton"), toast: $("toast"), printReport: $("printReport"),
    });
    const savedTheme = localStorage.getItem(THEME_KEY);
    applyTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    try {
      db = await openDatabase();
      await loadChecklistSettings();
      const audits = await listAudits();
      audit = audits[0] || createAudit();
      activateAuditChecklist();
      bindEvents();
      navigate("dashboard");
    } catch (error) {
      console.error(error);
      document.body.innerHTML = `<div style="max-width:560px;margin:80px auto;padding:24px;font-family:Tahoma"><h1>ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูล</h1><p>กรุณาเปิดแอปผ่านเบราว์เซอร์ปกติ หรือใช้คำสั่ง <code>npm start</code> แล้วเปิด http://127.0.0.1:4173</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
