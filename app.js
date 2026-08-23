(() => {
  "use strict";

  const DEFAULT_SECTIONS = JSON.parse(JSON.stringify(window.GHP_SECTIONS || []));
  const DEFAULT_MASTER_DATA = {
    sites: ["โรงงานบางพลี", "โรงงานเทพารักษ์", "KCG Logistics Park", "IDG บางนา"],
    departments: ["PD4"],
    areas: ["Dairy filling"],
  };
  const MASTER_LABELS = { sites: "Site / สถานที่ตั้ง", departments: "แผนก", areas: "พื้นที่ตรวจ" };
  let sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  let masterData = JSON.parse(JSON.stringify(DEFAULT_MASTER_DATA));
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
  const SETTINGS_STORE = "settings";
  const ADMIN_SALT = "ghp-admin-v1:";
  const ADMIN_HASH = "9df7e6c2a39fe0f381a066e9af7b6dfec0509e1ddbe10ad14a39df8e8eb0645f";

  const els = {};
  let db;
  let audit;
  let currentStep = "dashboard";
  let searchTerm = "";
  let findingsOnly = false;
  let saveTimer;
  let checklistSaveTimer;
  let toastTimer;
  let isAdmin = sessionStorage.getItem("ghp-admin-session") === "active";

  function rebuildItems() {
    allItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })));
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
  function createAudit() {
    const responses = {};
    allItems.forEach((item) => {
      responses[item.id] = {
        rating: null,
        note: "",
        photos: [],
        correctiveAction: "",
        responsibility: "",
        targetDate: "",
        actionStatus: "open",
        closurePhotos: [],
        confirmed: false,
      };
    });
    const now = new Date().toISOString();
    return {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      scoringProfile: "pd",
      meta: {
        title: "การตรวจประเมิน GHP เขตพื้นที่การผลิต",
        site: "",
        department: "PD4",
        area: "Dairy filling",
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
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
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
  function settingsRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, mode);
      const store = tx.objectStore(SETTINGS_STORE);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function loadChecklistSettings() {
    const saved = await settingsRequest("readonly", (store) => store.get("checklist"));
    if (Array.isArray(saved?.sections) && saved.sections.length) sections = saved.sections;
    if (saved?.masterData) {
      Object.keys(DEFAULT_MASTER_DATA).forEach((key) => {
        if (Array.isArray(saved.masterData[key]) && saved.masterData[key].length) masterData[key] = saved.masterData[key];
      });
    }
    rebuildItems();
  }
  async function saveChecklistSettings() {
    await settingsRequest("readwrite", (store) => store.put({ key: "checklist", sections, masterData, updatedAt: new Date().toISOString() }));
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
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function responseFor(itemId) {
    if (!audit.responses) audit.responses = {};
    if (!audit.responses[itemId]) audit.responses[itemId] = {};
    const response = audit.responses[itemId];
    if (!("rating" in response)) response.rating = null;
    if (!("note" in response)) response.note = "";
    if (!Array.isArray(response.photos)) response.photos = [];
    if (!("correctiveAction" in response)) response.correctiveAction = "";
    if (!("responsibility" in response)) response.responsibility = "";
    if (!("targetDate" in response)) response.targetDate = "";
    if (!("actionStatus" in response)) response.actionStatus = "open";
    if (!Array.isArray(response.closurePhotos)) response.closurePhotos = [];
    if (!("confirmed" in response)) response.confirmed = false;
    return response;
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

  function renderNav() {
    const metaActive = currentStep === "meta";
    const metaComplete = ["site", "department", "area", "auditDate", "auditor"].every((key) => audit.meta[key]);
    const findings = getFindings();
    const openFindings = findings.filter(({ response }) => response.actionStatus !== "closed").length;
    const items = [
      `<button class="nav-item nav-main ${currentStep === "dashboard" ? "active" : ""}" data-step="dashboard" data-short="ภาพรวม"><span class="nav-number">⌂</span><span class="nav-label">Dashboard ภาพรวม</span><span class="nav-progress">ดูผล</span></button>`,
      `<button class="nav-item nav-main ${metaActive ? "active" : ""} ${metaComplete ? "complete" : ""}" data-step="meta" data-short="กรอกแบบตรวจ"><span class="nav-number">✎</span><span class="nav-label">กรอกแบบตรวจ</span><span class="nav-progress">${metaComplete ? "พร้อม" : "เริ่มกรอก"}</span></button>`,
      `<button class="nav-item nav-main ${currentStep === "defects" ? "active" : ""} ${findings.length && !openFindings ? "complete" : ""}" data-step="defects" data-short="ตอบข้อบกพร่อง"><span class="nav-number">!</span><span class="nav-label">ตอบกลับข้อบกพร่อง</span><span class="nav-progress">${openFindings ? `${openFindings} เปิด` : findings.length ? "ปิดครบ" : "ยังไม่มี"}</span></button>`,
      `<button class="nav-item nav-main admin-nav ${currentStep === "admin" ? "active" : ""}" data-step="admin" data-short="Admin"><span class="nav-number">${isAdmin ? "⚙" : "▣"}</span><span class="nav-label">ผู้ดูแลระบบ</span><span class="nav-progress">${isAdmin ? "เข้าใช้งาน" : "ล็อก"}</span></button>`,
    ];
    sections.forEach((section) => {
      const stats = getStats(section.items);
      items.push(`<button class="nav-item ${currentStep === section.id ? "active" : ""} ${stats.answered === stats.total ? "complete" : ""}" data-step="${section.id}" data-short="${escapeHtml(sectionShortTitle(section))}"><span class="nav-number">${section.id}</span><span class="nav-label">${escapeHtml(sectionShortTitle(section))}</span><span class="nav-progress">${stats.answered}/${stats.total}</span></button>`);
    });
    els.sectionNav.innerHTML = items.join("");
  }

  function entryStats(entry) {
    const responses = entry.responses || {};
    const counts = { comply: 0, observe: 0, minor: 0, major: 0 };
    let answered = 0;
    let score = 0;
    const entryProfile = PROFILES[entry.scoringProfile] || PROFILES.pd;
    allItems.forEach((item) => {
      const rating = responses[item.id]?.rating;
      if (!rating) return;
      answered += 1;
      counts[rating] += 1;
      score += entryProfile[rating];
    });
    return { answered, counts, percent: answered ? (score / (answered * 2)) * 100 : null };
  }

  async function renderDashboard() {
    const stats = getStats();
    const findings = getFindings();
    const openFindings = findings.filter(({ response }) => response.actionStatus !== "closed");
    const closedFindings = findings.length - openFindings.length;
    const completion = Math.round((stats.answered / stats.total) * 100);
    els.dashboardView.innerHTML = `
      <section class="dashboard-hero">
        <div>
          <span class="eyebrow">KCG Corporation · Quality System</span>
          <h2>Dashboard ภาพรวมการตรวจ GHP</h2>
          <p>${escapeHtml(audit.meta.site || "ยังไม่ระบุ Site")} · ${escapeHtml(audit.meta.department || "ยังไม่ระบุแผนก")} · ${escapeHtml(audit.meta.area || "ยังไม่ระบุพื้นที่")} · ${escapeHtml(formatDate(audit.meta.auditDate))}</p>
        </div>
        <div class="dashboard-hero-actions">
          <button type="button" class="button primary" data-dashboard-action="audit">กรอกแบบตรวจ</button>
          <button type="button" class="button hero-secondary" data-dashboard-action="defects">ตอบกลับข้อบกพร่อง${openFindings.length ? ` (${openFindings.length})` : ""}</button>
        </div>
      </section>
      <section class="metric-grid" aria-label="สรุปผลการตรวจ">
        <article class="metric-card score"><span>คะแนนปัจจุบัน</span><strong>${displayPercent(stats.percent)}<small>${stats.percent === null ? "" : "%"}</small></strong><p>${stats.answered === stats.total ? (stats.percent >= PASS_THRESHOLD ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์") : "อยู่ระหว่างการตรวจ"}</p></article>
        <article class="metric-card progress"><span>ความคืบหน้า</span><strong>${stats.answered}<small> / ${stats.total}</small></strong><p>กรอกแล้ว ${completion}%</p><div class="metric-progress"><i style="width:${completion}%"></i></div></article>
        <article class="metric-card findings"><span>ข้อบกพร่องทั้งหมด</span><strong>${findings.length}<small> ข้อ</small></strong><p>รอดำเนินการ ${openFindings.length} · ปิดแล้ว ${closedFindings}</p></article>
        <article class="metric-card status"><span>สถานะแบบตรวจ</span><strong class="metric-status">${audit.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</strong><p>อัปเดตล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(audit.updatedAt))}</p></article>
      </section>
      <section class="dashboard-row">
        <article class="dashboard-card severity-card">
          <div class="card-heading"><div><span class="eyebrow">Finding summary</span><h3>สรุประดับข้อบกพร่อง</h3></div><button type="button" class="text-button" data-dashboard-action="defects">ดูและตอบกลับ</button></div>
          <div class="severity-list">
            ${["major", "minor", "observe"].map((rating) => `<button type="button" data-dashboard-action="defects" class="severity-item ${rating}"><span><i class="dot ${rating}"></i>${FINDING_RULES[rating].label}</span><strong>${stats.counts[rating]}</strong><small>${FINDING_RULES[rating].deadline}</small></button>`).join("")}
          </div>
          ${findings.length ? `<div class="closure-progress"><div><span>การปิดข้อบกพร่อง</span><b>${closedFindings}/${findings.length}</b></div><div class="metric-progress"><i style="width:${Math.round((closedFindings / findings.length) * 100)}%"></i></div></div>` : `<div class="dashboard-empty compact">ยังไม่พบ Major, Minor หรือ Observe</div>`}
        </article>
        <article class="dashboard-card recent-card">
          <div class="card-heading"><div><span class="eyebrow">On this device</span><h3>แบบตรวจล่าสุด</h3></div><button type="button" class="text-button" data-dashboard-action="history">ดูทั้งหมด</button></div>
          <div id="dashboardRecent" class="dashboard-recent"><div class="dashboard-empty compact">กำลังโหลด...</div></div>
        </article>
      </section>`;
    try {
      const audits = await listAudits();
      if (currentStep !== "dashboard") return;
      const recent = audits.slice(0, 4);
      $("dashboardRecent").innerHTML = recent.length ? recent.map((entry) => {
        const entrySummary = entryStats(entry);
        const entryFindings = entrySummary.counts.major + entrySummary.counts.minor + entrySummary.counts.observe;
        return `<button type="button" class="recent-audit ${entry.id === audit.id ? "active" : ""}" data-audit-id="${escapeHtml(entry.id)}"><span class="recent-date">${escapeHtml(formatDate(entry.meta?.auditDate))}</span><span><b>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")}</b><small>${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${escapeHtml(entry.meta?.department || "—")} · ${entrySummary.answered}/${allItems.length} ข้อ</small></span><span class="recent-result"><b>${displayPercent(entrySummary.percent)}${entrySummary.percent === null ? "" : "%"}</b><small>${entryFindings} ข้อพบ</small></span></button>`;
      }).join("") : `<div class="dashboard-empty compact">ยังไม่มีแบบตรวจ</div>`;
    } catch (error) {
      console.error(error);
    }
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
        return `<article class="defect-card ${response.rating} ${response.actionStatus === "closed" ? "is-closed" : ""}" data-defect-id="${item.id}">
          <header class="defect-card-head"><div><span class="severity-badge ${response.rating}">${rule.label}</span><b>Requirement ${item.id}</b><small>${escapeHtml(sectionShortTitle(section))}</small></div><span class="sla-label">ภายใน ${rule.deadline}</span></header>
          <div class="defect-requirement"><span>สิ่งที่ต้องตรวจสอบ</span><p>${escapeHtml(item.text).replace(/\n/g, "<br>")}</p></div>
          <div class="defect-evidence"><div><span>ข้อค้นพบ / หลักฐาน</span><p>${escapeHtml(response.note || "ยังไม่ได้ระบุรายละเอียดข้อค้นพบ")}</p></div>${(response.photos || []).length ? `<div class="defect-photo-row">${response.photos.map((photo, index) => `<img src="${escapeHtml(photo)}" alt="รูปหลักฐานข้อ ${item.id} รูปที่ ${index + 1}" />`).join("")}</div>` : ""}</div>
          <div class="corrective-grid">
            <label class="field"><span>ผู้รับผิดชอบ</span><input data-corrective="responsibility" value="${escapeHtml(response.responsibility)}" placeholder="ชื่อหรือหน่วยงาน" /></label>
            <label class="field"><span>กำหนดเสร็จ</span><input type="date" data-corrective="targetDate" value="${escapeHtml(targetValue)}" /></label>
            <label class="field"><span>สถานะ</span><select data-corrective="actionStatus">${Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${response.actionStatus === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <label class="field full"><span>การแก้ไขและป้องกันการเกิดซ้ำ</span><textarea data-corrective="correctiveAction" placeholder="อธิบายสิ่งที่ดำเนินการแก้ไข...">${escapeHtml(response.correctiveAction)}</textarea></label>
          </div>
          <div class="closure-attachments"><div><span>รูปหลังแก้ไข</span><small>แนบรูปเพื่อยืนยันผลการดำเนินการ</small></div><div class="attachment-row"><label class="attach-button">＋ แนบรูปหลังแก้ไข<input type="file" accept="image/*" capture="environment" data-closure-photo /></label>${(response.closurePhotos || []).map((photo, index) => `<span class="photo-wrap"><img class="photo-thumb" src="${escapeHtml(photo)}" alt="รูปหลังแก้ไขข้อ ${item.id}" /><button type="button" class="photo-remove" data-closure-remove="${index}" aria-label="ลบรูปหลังแก้ไข">×</button></span>`).join("")}</div></div>
        </article>`;
      }).join("")}</div>` : `<div class="dashboard-empty defect-empty"><div class="empty-icon">✓</div><h3>ยังไม่มีข้อบกพร่องที่ต้องตอบกลับ</h3><p>เมื่อเลือกระดับ Observe, Minor หรือ Major ในแบบตรวจ รายการจะแสดงที่หน้านี้อัตโนมัติ</p><button type="button" class="button primary" data-defect-action="audit">ไปกรอกแบบตรวจ</button></div>`}`;
  }

  async function verifyAdminPassword(password) {
    const bytes = new TextEncoder().encode(`${ADMIN_SALT}${password}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return hex === ADMIN_HASH;
  }

  function nextItemId(section) {
    let sequence = 1;
    const used = new Set(allItems.map((item) => item.id));
    while (used.has(`${section.id}.${sequence}`)) sequence += 1;
    return `${section.id}.${sequence}`;
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
    const findingsTotal = audits.reduce((sum, entry) => sum + allItems.filter((item) => FINDING_RULES[entry.responses?.[item.id]?.rating]).length, 0);
    let storageText = "กำลังคำนวณ";
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage != null) storageText = `${(estimate.usage / 1024 / 1024).toFixed(1)} MB`;
    } catch (error) { console.error(error); }
    if (currentStep !== "admin") return;
    els.adminView.innerHTML = `<div class="admin-heading"><div><span class="eyebrow">Administration</span><h2>ระบบหลังบ้าน</h2><p>จัดการ Checklist และข้อมูลแบบตรวจที่บันทึกบนอุปกรณ์นี้</p></div><button type="button" class="button secondary" data-admin-action="logout">ออกจากระบบ Admin</button></div>
      <section class="admin-metrics"><article><span>หมวดตรวจ</span><strong>${sections.length}</strong></article><article><span>คำถามทั้งหมด</span><strong>${allItems.length}</strong></article><article><span>แบบตรวจ</span><strong>${audits.length}</strong></article><article><span>ข้อบกพร่อง</span><strong>${findingsTotal}</strong></article><article><span>พื้นที่จัดเก็บ</span><strong>${storageText}</strong></article></section>
      <section class="admin-toolbar"><div><h3>จัดการคำถาม</h3><p>แก้ข้อความ เพิ่ม หรือลบคำถามได้ทันที</p></div><div><button type="button" class="button secondary" data-admin-action="export">สำรองข้อมูลระบบ</button><button type="button" class="button secondary" data-admin-action="reset">คืนคำถามเริ่มต้น</button><button type="button" class="button primary" data-admin-action="add-section">+ เพิ่มหมวด</button></div></section>
      <section class="admin-master-card"><div class="card-heading"><div><span class="eyebrow">Master data</span><h3>ตัวเลือกข้อมูลการตรวจประเมิน</h3><p>รายการเหล่านี้จะแสดงเป็น Dropdown ในหน้ากรอกข้อมูลการตรวจ</p></div></div><div class="admin-master-grid">${Object.keys(MASTER_LABELS).map((key) => `<section data-master-key="${key}"><header><h4>${MASTER_LABELS[key]}</h4><button type="button" data-admin-action="add-master">+ เพิ่ม</button></header><div>${masterData[key].map((value, index) => `<label data-master-index="${index}"><input data-master-value value="${escapeHtml(value)}" aria-label="${MASTER_LABELS[key]} ${index + 1}" /><button type="button" class="admin-delete-button" data-admin-action="delete-master">ลบ</button></label>`).join("")}</div></section>`).join("")}</div></section>
      <div class="admin-section-list">${sections.map((section, sectionIndex) => `<section class="admin-section" data-admin-section="${sectionIndex}"><header><label class="field"><span>ชื่อหมวด ${section.id}</span><input data-section-title value="${escapeHtml(section.title)}" /></label><div><b>${section.items.length} คำถาม</b><button type="button" class="admin-delete-button" data-admin-action="delete-section">ลบหมวด</button></div></header><div class="admin-question-list">${section.items.map((item, itemIndex) => `<article class="admin-question" data-admin-item="${itemIndex}"><span class="item-code">${escapeHtml(item.id)}</span><textarea data-question-text aria-label="คำถาม ${escapeHtml(item.id)}">${escapeHtml(item.text)}</textarea><button type="button" class="admin-delete-button" data-admin-action="delete-question">ลบ</button></article>`).join("")}</div><button type="button" class="admin-add-question" data-admin-action="add-question">+ เพิ่มคำถามในหมวดนี้</button></section>`).join("")}</div>
      <section class="admin-data-card"><div class="card-heading"><div><span class="eyebrow">Audit data</span><h3>ข้อมูลแบบตรวจบนอุปกรณ์</h3></div></div><div class="admin-audit-list">${audits.length ? audits.map((entry) => { const stats = entryStats(entry); return `<article data-admin-audit="${escapeHtml(entry.id)}"><div><b>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")}</b><span>${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${escapeHtml(entry.meta?.department || "—")} · ${escapeHtml(formatDate(entry.meta?.auditDate))}</span></div><div><strong>${stats.answered}/${allItems.length}</strong><span>${entry.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</span></div><button type="button" class="admin-delete-button" data-admin-action="delete-audit">ลบข้อมูล</button></article>`; }).join("") : `<div class="dashboard-empty compact">ยังไม่มีข้อมูลแบบตรวจ</div>`}</div></section>`;
  }

  async function confirmAndAdvance(itemId) {
    const response = responseFor(itemId);
    if (!response.rating) {
      showToast("กรุณาเลือกผลการตรวจก่อนยืนยัน");
      return;
    }
    response.confirmed = true;
    await saveNow();
    const currentIndex = allItems.findIndex((item) => item.id === itemId);
    const nextItem = allItems[currentIndex + 1];
    if (!nextItem) {
      navigate("dashboard");
      showToast("ยืนยันครบถึงข้อสุดท้ายแล้ว");
      return;
    }
    if (nextItem.sectionId !== currentStep) {
      navigate(nextItem.sectionId);
      showToast(`ยืนยันข้อ ${itemId} แล้ว · ไปหมวดถัดไป`);
      return;
    }
    searchTerm = "";
    findingsOnly = false;
    els.itemSearch.value = "";
    els.findingFilter.checked = false;
    renderChecklist();
    requestAnimationFrame(() => {
      const nextCard = els.checklist.querySelector(`[data-item-id="${CSS.escape(nextItem.id)}"]`);
      nextCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      nextCard?.querySelector("[data-rating]")?.focus({ preventScroll: true });
    });
    updateSummary();
    showToast(`ยืนยันข้อ ${itemId} แล้ว · ไปข้อ ${nextItem.id}`);
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
          <label class="field full"><span>ชื่อแบบตรวจ</span><input data-meta="title" value="${escapeHtml(audit.meta.title)}" /></label>
          <label class="field"><span>Site / สถานที่ตั้ง</span><select data-meta="site">${selectOptions(masterData.sites, audit.meta.site || "", "เลือก Site")}</select></label>
          <label class="field"><span>แผนก</span><select data-meta="department">${selectOptions(masterData.departments, audit.meta.department || "", "เลือกแผนก")}</select></label>
          <label class="field"><span>พื้นที่ตรวจ</span><select data-meta="area">${selectOptions(masterData.areas, audit.meta.area || "", "เลือกพื้นที่")}</select></label>
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
    els.metaView.querySelectorAll("[data-meta]").forEach((input) => {
      input.addEventListener("input", () => {
        audit.meta[input.dataset.meta] = input.value;
        audit.status = "draft";
        scheduleSave();
      });
    });
    $("startAuditButton").addEventListener("click", () => navigate(sections[0].id));
  }

  function renderChecklist() {
    const section = sections.find((entry) => entry.id === currentStep);
    if (!section) return;
    const stats = getStats(section.items);
    els.sectionEyebrow.textContent = `หมวดที่ ${section.id} จาก ${sections.length}`;
    els.sectionTitle.textContent = section.title.replace(/^\d+\.\s*/, "");
    els.sectionSubtitle.textContent = `${section.items.length} ข้อ · คะแนนเต็ม ${section.items.length * 2}`;
    els.sectionScore.innerHTML = `<strong>${stats.score.toFixed(Number.isInteger(stats.score) ? 0 : 1)} / ${stats.maxScore}</strong><span>${stats.answered}/${stats.total} ข้อ · ${displayPercent(stats.percent)}%</span>`;

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th");
    const visible = section.items.filter((item) => {
      const response = responseFor(item.id);
      const matchesSearch = !normalizedSearch || `${item.id} ${item.text}`.toLocaleLowerCase("th").includes(normalizedSearch);
      const matchesFinding = !findingsOnly || (response.rating && response.rating !== "comply");
      return matchesSearch && matchesFinding;
    });

    els.checklist.innerHTML = visible.map((item) => {
      const response = responseFor(item.id);
      const isFinding = response.rating && response.rating !== "comply";
      const scoreProfile = profile();
      return `<article class="check-item ${response.confirmed ? "confirmed" : ""}" data-item-id="${item.id}">
        <div class="check-main">
          <span class="item-code">${item.id}</span>
          <div>
            <p class="item-text">${escapeHtml(item.text).replace(/\n/g, "<br>")}</p>
            <div class="rating-group" role="radiogroup" aria-label="ผลการตรวจข้อ ${item.id}">
              ${Object.keys(RATING_LABELS).map((rating) => `<button type="button" role="radio" aria-checked="${response.rating === rating}" class="rating-button ${response.rating === rating ? "selected" : ""}" data-rating="${rating}"><i class="dot ${rating}"></i>${RATING_LABELS[rating]} <span class="rating-score">${scoreProfile[rating]}</span></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="finding-panel" ${isFinding ? "" : "hidden"}>
          <label>ข้อค้นพบ / การดำเนินการแก้ไข
            <textarea data-note placeholder="ระบุสิ่งที่พบ ตำแหน่ง และผู้รับผิดชอบ...">${escapeHtml(response.note)}</textarea>
          </label>
          <div class="attachment-row">
            <label class="attach-button">＋ แนบรูป<input type="file" accept="image/*" capture="environment" data-photo /></label>
            ${(response.photos || []).map((photo, index) => `<span class="photo-wrap"><img class="photo-thumb" src="${photo}" alt="รูปแนบข้อ ${item.id}" /><button type="button" class="photo-remove" data-photo-remove="${index}" aria-label="ลบรูป">×</button></span>`).join("")}
          </div>
        </div>
        <div class="item-confirm-row">
          <span>${response.confirmed ? "ยืนยันคำตอบข้อนี้แล้ว" : response.rating ? "ตรวจสอบคำตอบแล้วกดยืนยัน" : "กรุณาเลือกผลการตรวจก่อน"}</span>
          <button type="button" class="button ${response.confirmed ? "secondary" : "primary"}" data-confirm-item ${response.rating ? "" : "disabled"}>${response.confirmed ? "ยืนยันอีกครั้งและไปข้อต่อไป →" : "ยืนยันและไปข้อต่อไป →"}</button>
        </div>
      </article>`;
    }).join("");
    els.emptyState.hidden = visible.length > 0;
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
    else els.mobileNextButton.textContent = currentStep === "meta" ? "เริ่มตรวจ" : currentStep === sections.at(-1).id ? "สรุปผล" : "หมวดถัดไป";
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
    return `GHP-${area}-${audit.meta.auditDate || today()}.${extension}`;
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
  function exportCsv() {
    const rows = [
      ["KCG GHP Audit Report"],
      ["Site", audit.meta.site || "", "แผนก", audit.meta.department, "พื้นที่", audit.meta.area],
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
    downloadBlob(`\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, safeFilename("csv"), "text/csv;charset=utf-8");
    showToast("ดาวน์โหลด CSV แล้ว");
  }
  function exportJson() {
    downloadBlob(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), audit }, null, 2), safeFilename("json"), "application/json;charset=utf-8");
    showToast("ดาวน์โหลดไฟล์สำรองแล้ว");
  }
  async function preparePrint() {
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
            <div class="print-finding-description"><span>Description / Evidence</span><p>${escapeHtml(response.note || "ไม่ได้ระบุรายละเอียด")}</p></div>
            ${(response.photos || []).length ? `<h4 class="print-photo-label">รูปหลักฐานข้อบกพร่อง</h4><div class="print-photo-grid">${response.photos.map((photo, photoIndex) => `<figure><img src="${escapeHtml(photo)}" alt="รูปหลักฐานข้อ ${escapeHtml(item.id)} รูปที่ ${photoIndex + 1}" /><figcaption>รูปหลักฐาน ${photoIndex + 1}</figcaption></figure>`).join("")}</div>` : `<p class="print-no-photo">ไม่มีรูปหลักฐานแนบ</p>`}
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
        <div><span>Site</span><br><b>${escapeHtml(audit.meta.site || "—")}</b></div>
        <div><span>แผนก</span><br><b>${escapeHtml(audit.meta.department)}</b></div>
        <div><span>พื้นที่</span><br><b>${escapeHtml(audit.meta.area)}</b></div>
        <div><span>วันที่ตรวจ</span><br><b>${escapeHtml(formatDate(audit.meta.auditDate))}</b></div>
        <div><span>Auditor</span><br><b>${escapeHtml(audit.meta.auditor || "—")}</b></div>
        <div><span>Auditee</span><br><b>${escapeHtml(audit.meta.auditee || "—")}</b></div>
        <div><span>เกณฑ์คะแนน</span><br><b>${escapeHtml(profile().label)}</b></div>
      </div>
      <div class="print-summary"><div>ตอบแล้ว<br><b>${stats.answered}/${stats.total}</b></div><div>คะแนน<br><b>${stats.score}/${stats.maxScore}</b></div><div>คิดเป็น<br><b>${displayPercent(stats.percent)}%</b></div><div>ผลประเมิน<br><b>${result}</b></div></div>
      ${findingsReport}
      <h2 class="print-checklist-heading">รายละเอียด Checklist ทั้งหมด</h2>
      ${sections.map((section) => `<section class="print-section"><h2>${escapeHtml(section.title)}</h2><table class="print-table"><thead><tr><th class="print-code">ข้อ</th><th>สิ่งที่ต้องตรวจสอบ</th><th class="print-rating">ผล</th><th class="print-note">ข้อค้นพบ</th></tr></thead><tbody>${section.items.map((item) => { const response = responseFor(item.id); const photoCount = response.photos?.length || 0; const closureCount = response.closurePhotos?.length || 0; return `<tr><td>${item.id}</td><td>${escapeHtml(item.text).replace(/\n/g,"<br>")}</td><td class="print-rating">${response.rating ? RATING_LABELS[response.rating] : "—"}</td><td>${escapeHtml(response.note || "")}${photoCount ? `<small class="print-photo-count">รูปหลักฐาน ${photoCount} รูป</small>` : ""}${closureCount ? `<small class="print-photo-count">รูปหลังแก้ไข ${closureCount} รูป</small>` : ""}</td></tr>`; }).join("")}</tbody></table></section>`).join("")}`;
    const printImages = [...els.printReport.querySelectorAll("img")];
    await Promise.all(printImages.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  }

  async function showHistory() {
    const audits = await listAudits();
    els.historyList.innerHTML = audits.length ? audits.map((entry) => {
      const answered = allItems.filter((item) => entry.responses?.[item.id]?.rating).length;
      return `<article class="history-item ${entry.id === audit.id ? "active" : ""}" data-history-id="${entry.id}"><div><h4>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")} · ${escapeHtml(entry.meta?.department || "—")}</h4><p>${escapeHtml(entry.meta?.site || "ยังไม่ระบุ Site")} · ${formatDate(entry.meta?.auditDate)} · ${answered}/${allItems.length} ข้อ · ${entry.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</p></div><div class="history-actions"><button type="button" data-history-open>เปิด</button><button type="button" data-history-delete>ลบ</button></div></article>`;
    }).join("") : `<div class="history-empty">ยังไม่มีแบบตรวจที่บันทึกไว้</div>`;
    els.historyDialog.showModal();
  }

  async function completeAudit() {
    const stats = getStats();
    if (stats.answered < stats.total) {
      const firstMissing = allItems.find((item) => !responseFor(item.id).rating);
      showToast(`ยังเหลือ ${stats.total - stats.answered} ข้อ กรุณาตอบให้ครบ`);
      navigate(firstMissing.sectionId);
      return;
    }
    const missingNotes = allItems.filter((item) => {
      const response = responseFor(item.id);
      return response.rating !== "comply" && !response.note.trim();
    });
    if (missingNotes.length && !confirm(`มีข้อค้นพบ ${missingNotes.length} ข้อที่ยังไม่มีรายละเอียด ต้องการเสร็จสิ้นต่อหรือไม่?`)) {
      navigate(missingNotes[0].sectionId);
      return;
    }
    audit.status = "complete";
    await saveNow();
    updateAll();
    showToast(`บันทึกผลแล้ว: ${stats.percent >= PASS_THRESHOLD ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์"} ${displayPercent(stats.percent)}%`);
  }

  function bindEvents() {
    els.sectionNav.addEventListener("click", (event) => {
      const button = event.target.closest("[data-step]");
      if (button) navigate(button.dataset.step);
    });
    els.homeButton.addEventListener("click", () => navigate("dashboard"));
    els.dashboardView.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-dashboard-action]")?.dataset.dashboardAction;
      if (action === "audit") navigate("meta");
      if (action === "defects") navigate("defects");
      if (action === "history") showHistory();
      const recent = event.target.closest("[data-audit-id]");
      if (recent && recent.dataset.auditId !== audit.id) {
        audit = await dbRequest("readonly", (store) => store.get(recent.dataset.auditId));
        navigate("dashboard");
        showToast("เปิดแบบตรวจแล้ว");
      }
    });
    els.itemSearch.addEventListener("input", () => { searchTerm = els.itemSearch.value; renderChecklist(); });
    els.findingFilter.addEventListener("change", () => { findingsOnly = els.findingFilter.checked; renderChecklist(); });
    els.checklist.addEventListener("click", async (event) => {
      const itemElement = event.target.closest(".check-item");
      if (!itemElement) return;
      const itemId = itemElement.dataset.itemId;
      const ratingButton = event.target.closest("[data-rating]");
      const removeButton = event.target.closest("[data-photo-remove]");
      const confirmButton = event.target.closest("[data-confirm-item]");
      if (confirmButton) {
        await confirmAndAdvance(itemId);
      } else if (ratingButton) {
        const response = responseFor(itemId);
        response.rating = ratingButton.dataset.rating;
        response.confirmed = false;
        if (FINDING_RULES[response.rating] && !response.targetDate) response.targetDate = suggestedTargetDate(response.rating);
        audit.status = "draft";
        scheduleSave();
        updateAll();
      } else if (removeButton) {
        responseFor(itemId).photos.splice(Number(removeButton.dataset.photoRemove), 1);
        scheduleSave();
        renderChecklist();
      }
    });
    els.checklist.addEventListener("input", (event) => {
      if (!event.target.matches("[data-note]")) return;
      const itemId = event.target.closest(".check-item").dataset.itemId;
      responseFor(itemId).note = event.target.value;
      audit.status = "draft";
      scheduleSave();
    });
    els.checklist.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-photo]") || !event.target.files?.[0]) return;
      const itemId = event.target.closest(".check-item").dataset.itemId;
      try {
        showToast("กำลังย่อและแนบรูป...");
        const photo = await compressImage(event.target.files[0]);
        responseFor(itemId).photos.push(photo);
        scheduleSave();
        renderChecklist();
        showToast("แนบรูปแล้ว");
      } catch (error) {
        console.error(error);
        showToast("ไม่สามารถแนบรูปนี้ได้");
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
      if (!event.target.matches("[data-closure-photo]") || !event.target.files?.[0]) return;
      try {
        showToast("กำลังย่อและแนบรูปหลังแก้ไข...");
        const photo = await compressImage(event.target.files[0]);
        responseFor(itemId).closurePhotos.push(photo);
        scheduleSave();
        renderDefects();
        showToast("แนบรูปหลังแก้ไขแล้ว");
      } catch (error) {
        console.error(error);
        showToast("ไม่สามารถแนบรูปนี้ได้");
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
      sessionStorage.setItem("ghp-admin-session", "active");
      updateAll({ checklist: false });
      showToast("เข้าสู่ระบบ Admin แล้ว");
    });
    els.adminView.addEventListener("input", (event) => {
      if (!isAdmin) return;
      const masterElement = event.target.closest("[data-master-key]");
      if (masterElement && event.target.matches("[data-master-value]")) {
        const key = masterElement.dataset.masterKey;
        const index = Number(event.target.closest("[data-master-index]").dataset.masterIndex);
        if (masterData[key]?.[index] != null) masterData[key][index] = event.target.value;
        scheduleChecklistSave();
        return;
      }
      const sectionElement = event.target.closest("[data-admin-section]");
      if (!sectionElement) return;
      const sectionIndex = Number(sectionElement.dataset.adminSection);
      const section = sections[sectionIndex];
      if (!section) return;
      if (event.target.matches("[data-section-title]")) section.title = event.target.value;
      if (event.target.matches("[data-question-text]")) {
        const itemIndex = Number(event.target.closest("[data-admin-item]").dataset.adminItem);
        if (section.items[itemIndex]) section.items[itemIndex].text = event.target.value;
      }
      rebuildItems();
      scheduleChecklistSave();
    });
    els.adminView.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-admin-action]");
      if (!button || !isAdmin) return;
      const action = button.dataset.adminAction;
      if (action === "logout") {
        isAdmin = false;
        sessionStorage.removeItem("ghp-admin-session");
        updateAll({ checklist: false });
        showToast("ออกจากระบบ Admin แล้ว");
        return;
      }
      if (action === "export") {
        const audits = await listAudits();
        const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), checklist: sections, masterData, audits };
        downloadBlob(JSON.stringify(payload, null, 2), `KCG-GHP-System-Backup-${today()}.json`, "application/json;charset=utf-8");
        showToast("ดาวน์โหลดข้อมูลระบบแล้ว");
        return;
      }
      if (action === "reset") {
        if (!confirm("คืนคำถามและตัวเลือกข้อมูลทั้งหมดเป็นค่าเริ่มต้นหรือไม่? ข้อมูลคำตอบเดิมจะยังคงอยู่")) return;
        sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
        masterData = JSON.parse(JSON.stringify(DEFAULT_MASTER_DATA));
        rebuildItems();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast("คืนคำถามเริ่มต้นแล้ว");
        return;
      }
      if (action === "add-section") {
        const numericIds = sections.map((section) => Number(section.id)).filter(Number.isFinite);
        const id = String((numericIds.length ? Math.max(...numericIds) : 0) + 1);
        sections.push({ id, title: `${id}. หมวดใหม่`, weight: 2, items: [{ id: `${id}.1`, text: "คำถามใหม่" }] });
        rebuildItems();
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
      const sectionElement = button.closest("[data-admin-section]");
      const sectionIndex = Number(sectionElement?.dataset.adminSection);
      const section = sections[sectionIndex];
      if (action === "add-question" && section) {
        const id = nextItemId(section);
        section.items.push({ id, text: "คำถามใหม่" });
        section.weight = section.items.length * 2;
        rebuildItems();
        responseFor(id);
        await Promise.all([saveChecklistSettings(), saveNow()]);
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
        rebuildItems();
        await saveChecklistSettings();
        updateAll({ checklist: false });
        showToast(`ลบคำถาม ${item.id} แล้ว`);
        return;
      }
      if (action === "delete-section" && section) {
        if (!confirm(`ลบหมวด ${section.id} และคำถามทั้งหมดในหมวดนี้หรือไม่?`)) return;
        sections.splice(sectionIndex, 1);
        rebuildItems();
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
          if (!remaining.length) await saveNow();
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
      if (button.dataset.export === "csv") exportCsv();
      if (button.dataset.export === "json") exportJson();
      if (button.dataset.export === "print") { await preparePrint(); window.print(); }
      els.exportDialog.close();
    });
    els.completeButton.addEventListener("click", completeAudit);
    els.mobileNextButton.addEventListener("click", () => {
      if (currentStep === "dashboard") navigate("meta");
      else if (currentStep === "defects") navigate("dashboard");
      else if (currentStep === "admin") navigate("dashboard");
      else if (currentStep === "meta") navigate(sections[0].id);
      else {
        const index = sections.findIndex((section) => section.id === currentStep);
        if (index < sections.length - 1) navigate(sections[index + 1].id);
        else completeAudit();
      }
    });
    els.historyButton.addEventListener("click", showHistory);
    els.historyList.addEventListener("click", async (event) => {
      const item = event.target.closest("[data-history-id]");
      if (!item) return;
      if (event.target.closest("[data-history-open]")) {
        audit = await dbRequest("readonly", (store) => store.get(item.dataset.historyId));
        els.historyDialog.close();
        navigate("dashboard");
        showToast("เปิดแบบตรวจแล้ว");
      }
      if (event.target.closest("[data-history-delete]")) {
        if (!confirm("ลบแบบตรวจนี้ออกจากอุปกรณ์หรือไม่?")) return;
        await dbRequest("readwrite", (store) => store.delete(item.dataset.historyId));
        if (item.dataset.historyId === audit.id) {
          audit = createAudit();
          await saveNow();
          navigate("dashboard");
        }
        showHistory();
      }
    });
    els.newAuditButton.addEventListener("click", async () => {
      audit = createAudit();
      await saveNow();
      els.historyDialog.close();
      navigate("meta");
      showToast("สร้างแบบตรวจใหม่แล้ว");
    });
  }

  async function init() {
    Object.assign(els, {
      homeButton: $("homeButton"), historyButton: $("historyButton"), saveStatus: $("saveStatus"),
      progressText: $("progressText"), progressBar: $("progressBar"), progressHint: $("progressHint"),
      sectionNav: $("sectionNav"), scoringButton: $("scoringButton"), dashboardView: $("dashboardView"), metaView: $("metaView"), checklistView: $("checklistView"), defectsView: $("defectsView"), adminView: $("adminView"),
      sectionEyebrow: $("sectionEyebrow"), sectionTitle: $("sectionTitle"), sectionSubtitle: $("sectionSubtitle"), sectionScore: $("sectionScore"),
      itemSearch: $("itemSearch"), findingFilter: $("findingFilter"), checklist: $("checklist"), emptyState: $("emptyState"),
      overallScore: $("overallScore"), resultBadge: $("resultBadge"), exportButton: $("exportButton"), completeButton: $("completeButton"),
      mobileScore: $("mobileScore"), mobileNextButton: $("mobileNextButton"), exportDialog: $("exportDialog"), scoringDialog: $("scoringDialog"),
      historyDialog: $("historyDialog"), historyList: $("historyList"), newAuditButton: $("newAuditButton"), toast: $("toast"), printReport: $("printReport"),
    });
    try {
      db = await openDatabase();
      await loadChecklistSettings();
      const audits = await listAudits();
      audit = audits[0] || createAudit();
      if (!audits.length) await saveNow();
      bindEvents();
      navigate("dashboard");
    } catch (error) {
      console.error(error);
      document.body.innerHTML = `<div style="max-width:560px;margin:80px auto;padding:24px;font-family:Tahoma"><h1>ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูล</h1><p>กรุณาเปิดแอปผ่านเบราว์เซอร์ปกติ หรือใช้คำสั่ง <code>npm start</code> แล้วเปิด http://127.0.0.1:4173</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
