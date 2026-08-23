(() => {
  "use strict";

  const sections = window.GHP_SECTIONS || [];
  const allItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })));
  const PASS_THRESHOLD = 87;
  const PROFILES = {
    pd: { label: "Checklist PD", comply: 2, observe: 1, minor: 0, major: -1 },
    definition: { label: "Definition", comply: 2, observe: 1.5, minor: 1, major: 0 },
  };
  const RATING_LABELS = { comply: "Comply", observe: "Observe", minor: "Minor", major: "Major" };
  const DB_NAME = "ghp-audit-monitoring";
  const STORE_NAME = "audits";

  const els = {};
  let db;
  let audit;
  let currentStep = "meta";
  let searchTerm = "";
  let findingsOnly = false;
  let saveTimer;
  let toastTimer;

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
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
    allItems.forEach((item) => { responses[item.id] = { rating: null, note: "", photos: [] }; });
    const now = new Date().toISOString();
    return {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      scoringProfile: "pd",
      meta: {
        title: "การตรวจประเมิน GHP เขตพื้นที่การผลิต",
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
      const request = indexedDB.open(DB_NAME, 1);
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
    if (!audit.responses[itemId]) audit.responses[itemId] = { rating: null, note: "", photos: [] };
    return audit.responses[itemId];
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
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function renderNav() {
    const metaActive = currentStep === "meta";
    const metaComplete = ["department", "area", "auditDate", "auditor"].every((key) => audit.meta[key]);
    const items = [
      `<button class="nav-item ${metaActive ? "active" : ""} ${metaComplete ? "complete" : ""}" data-step="meta" data-short="ข้อมูล"><span class="nav-number">✓</span><span class="nav-label">ข้อมูลการตรวจ</span><span class="nav-progress">${metaComplete ? "พร้อม" : "กรอกข้อมูล"}</span></button>`,
    ];
    sections.forEach((section) => {
      const stats = getStats(section.items);
      items.push(`<button class="nav-item ${currentStep === section.id ? "active" : ""} ${stats.answered === stats.total ? "complete" : ""}" data-step="${section.id}" data-short="${escapeHtml(sectionShortTitle(section))}"><span class="nav-number">${section.id}</span><span class="nav-label">${escapeHtml(sectionShortTitle(section))}</span><span class="nav-progress">${stats.answered}/${stats.total}</span></button>`);
    });
    els.sectionNav.innerHTML = items.join("");
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
          <label class="field"><span>แผนก</span><input data-meta="department" value="${escapeHtml(audit.meta.department)}" placeholder="เช่น PD4" /></label>
          <label class="field"><span>พื้นที่ตรวจ</span><input data-meta="area" value="${escapeHtml(audit.meta.area)}" placeholder="เช่น Dairy filling" /></label>
          <label class="field"><span>ประจำเดือน</span><input type="month" data-meta="auditMonth" value="${escapeHtml(audit.meta.auditMonth)}" /></label>
          <label class="field"><span>วันที่ตรวจ</span><input type="date" data-meta="auditDate" value="${escapeHtml(audit.meta.auditDate)}" /></label>
          <label class="field"><span>Auditor / ผู้ตรวจ</span><input data-meta="auditor" value="${escapeHtml(audit.meta.auditor)}" placeholder="ชื่อผู้ตรวจ" /></label>
          <label class="field"><span>Auditee / ผู้รับการตรวจ</span><input data-meta="auditee" value="${escapeHtml(audit.meta.auditee)}" placeholder="ชื่อผู้รับการตรวจ" /></label>
        </div>
        <div class="form-footer">
          <p>40 ข้อ · 6 หมวด · คะแนนเต็ม 80 · ผ่านเมื่อได้ตั้งแต่ ${PASS_THRESHOLD}%</p>
          <button class="button primary" id="startAuditButton" type="button">เริ่มทำแบบตรวจ →</button>
        </div>
      </div>`;
    els.metaView.querySelectorAll("[data-meta]").forEach((input) => {
      input.addEventListener("input", () => {
        audit.meta[input.dataset.meta] = input.value;
        audit.status = "draft";
        els.auditAreaLabel.textContent = `${audit.meta.department || "—"} · ${audit.meta.area || "ยังไม่ระบุพื้นที่"}`;
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
    els.sectionSubtitle.textContent = `${section.items.length} ข้อ · คะแนนเต็ม ${section.weight}`;
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
        <div class="finding-panel" ${isFinding ? "" : "hidden"}>
          <label>ข้อค้นพบ / การดำเนินการแก้ไข
            <textarea data-note placeholder="ระบุสิ่งที่พบ ตำแหน่ง และผู้รับผิดชอบ...">${escapeHtml(response.note)}</textarea>
          </label>
          <div class="attachment-row">
            <label class="attach-button">＋ แนบรูป<input type="file" accept="image/*" capture="environment" data-photo /></label>
            ${(response.photos || []).map((photo, index) => `<span class="photo-wrap"><img class="photo-thumb" src="${photo}" alt="รูปแนบข้อ ${item.id}" /><button type="button" class="photo-remove" data-photo-remove="${index}" aria-label="ลบรูป">×</button></span>`).join("")}
          </div>
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
    els.auditAreaLabel.textContent = `${audit.meta.department || "—"} · ${audit.meta.area || "ยังไม่ระบุพื้นที่"}`;
    els.mobileNextButton.textContent = currentStep === "meta" ? "เริ่มตรวจ" : currentStep === sections.at(-1).id ? "สรุปผล" : "หมวดถัดไป";
  }

  function updateAll({ checklist = true } = {}) {
    renderNav();
    if (currentStep === "meta") renderMeta();
    else if (checklist) renderChecklist();
    updateSummary();
  }
  function navigate(step) {
    currentStep = step;
    searchTerm = "";
    findingsOnly = false;
    els.itemSearch.value = "";
    els.findingFilter.checked = false;
    els.metaView.hidden = step !== "meta";
    els.checklistView.hidden = step === "meta";
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
      ["GHP Audit Monitoring"],
      ["แผนก", audit.meta.department, "พื้นที่", audit.meta.area],
      ["วันที่ตรวจ", audit.meta.auditDate, "Auditor", audit.meta.auditor, "Auditee", audit.meta.auditee],
      [],
      ["หมวด", "ข้อ", "สิ่งที่ต้องตรวจสอบ", "ผลการตรวจ", "คะแนน", "ข้อค้นพบ", "จำนวนรูป"],
    ];
    sections.forEach((section) => section.items.forEach((item) => {
      const response = responseFor(item.id);
      rows.push([sectionShortTitle(section), item.id, item.text, response.rating ? RATING_LABELS[response.rating] : "", response.rating ? profile()[response.rating] : "", response.note, response.photos?.length || 0]);
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
  function preparePrint() {
    const stats = getStats();
    const result = stats.answered === stats.total ? (stats.percent >= PASS_THRESHOLD ? "ผ่าน" : "ไม่ผ่าน") : "ยังไม่ครบ";
    els.printReport.innerHTML = `
      <header class="print-header"><h1>GHP Audit Monitoring</h1><div>KCG Corporation Public Company Limited · Quality System Dept.</div></header>
      <div class="print-meta">
        <div><span>แผนก</span><br><b>${escapeHtml(audit.meta.department)}</b></div>
        <div><span>พื้นที่</span><br><b>${escapeHtml(audit.meta.area)}</b></div>
        <div><span>วันที่ตรวจ</span><br><b>${escapeHtml(formatDate(audit.meta.auditDate))}</b></div>
        <div><span>Auditor</span><br><b>${escapeHtml(audit.meta.auditor || "—")}</b></div>
        <div><span>Auditee</span><br><b>${escapeHtml(audit.meta.auditee || "—")}</b></div>
        <div><span>เกณฑ์คะแนน</span><br><b>${escapeHtml(profile().label)}</b></div>
      </div>
      <div class="print-summary"><div>ตอบแล้ว<br><b>${stats.answered}/${stats.total}</b></div><div>คะแนน<br><b>${stats.score}/${stats.maxScore}</b></div><div>คิดเป็น<br><b>${displayPercent(stats.percent)}%</b></div><div>ผลประเมิน<br><b>${result}</b></div></div>
      ${sections.map((section) => `<section class="print-section"><h2>${escapeHtml(section.title)}</h2><table class="print-table"><thead><tr><th class="print-code">ข้อ</th><th>สิ่งที่ต้องตรวจสอบ</th><th class="print-rating">ผล</th><th class="print-note">ข้อค้นพบ</th></tr></thead><tbody>${section.items.map((item) => { const response = responseFor(item.id); return `<tr><td>${item.id}</td><td>${escapeHtml(item.text).replace(/\n/g,"<br>")}</td><td class="print-rating">${response.rating ? RATING_LABELS[response.rating] : "—"}</td><td>${escapeHtml(response.note || "")}</td></tr>`; }).join("")}</tbody></table></section>`).join("")}`;
  }

  async function showHistory() {
    const audits = await listAudits();
    els.historyList.innerHTML = audits.length ? audits.map((entry) => {
      const answered = allItems.filter((item) => entry.responses?.[item.id]?.rating).length;
      return `<article class="history-item ${entry.id === audit.id ? "active" : ""}" data-history-id="${entry.id}"><div><h4>${escapeHtml(entry.meta?.area || "ยังไม่ระบุพื้นที่")} · ${escapeHtml(entry.meta?.department || "—")}</h4><p>${formatDate(entry.meta?.auditDate)} · ${answered}/${allItems.length} ข้อ · ${entry.status === "complete" ? "เสร็จสิ้น" : "ฉบับร่าง"}</p></div><div class="history-actions"><button type="button" data-history-open>เปิด</button><button type="button" data-history-delete>ลบ</button></div></article>`;
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
    els.homeButton.addEventListener("click", () => navigate("meta"));
    els.itemSearch.addEventListener("input", () => { searchTerm = els.itemSearch.value; renderChecklist(); });
    els.findingFilter.addEventListener("change", () => { findingsOnly = els.findingFilter.checked; renderChecklist(); });
    els.checklist.addEventListener("click", (event) => {
      const itemElement = event.target.closest(".check-item");
      if (!itemElement) return;
      const itemId = itemElement.dataset.itemId;
      const ratingButton = event.target.closest("[data-rating]");
      const removeButton = event.target.closest("[data-photo-remove]");
      if (ratingButton) {
        responseFor(itemId).rating = ratingButton.dataset.rating;
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
    els.exportDialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      if (button.dataset.export === "csv") exportCsv();
      if (button.dataset.export === "json") exportJson();
      if (button.dataset.export === "print") { preparePrint(); window.print(); }
      els.exportDialog.close();
    });
    els.completeButton.addEventListener("click", completeAudit);
    els.mobileNextButton.addEventListener("click", () => {
      if (currentStep === "meta") navigate(sections[0].id);
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
        navigate("meta");
        showToast("เปิดแบบตรวจแล้ว");
      }
      if (event.target.closest("[data-history-delete]")) {
        if (!confirm("ลบแบบตรวจนี้ออกจากอุปกรณ์หรือไม่?")) return;
        await dbRequest("readwrite", (store) => store.delete(item.dataset.historyId));
        if (item.dataset.historyId === audit.id) {
          audit = createAudit();
          await saveNow();
          navigate("meta");
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
      auditAreaLabel: $("auditAreaLabel"), progressText: $("progressText"), progressBar: $("progressBar"), progressHint: $("progressHint"),
      sectionNav: $("sectionNav"), scoringButton: $("scoringButton"), metaView: $("metaView"), checklistView: $("checklistView"),
      sectionEyebrow: $("sectionEyebrow"), sectionTitle: $("sectionTitle"), sectionSubtitle: $("sectionSubtitle"), sectionScore: $("sectionScore"),
      itemSearch: $("itemSearch"), findingFilter: $("findingFilter"), checklist: $("checklist"), emptyState: $("emptyState"),
      overallScore: $("overallScore"), resultBadge: $("resultBadge"), exportButton: $("exportButton"), completeButton: $("completeButton"),
      mobileScore: $("mobileScore"), mobileNextButton: $("mobileNextButton"), exportDialog: $("exportDialog"), scoringDialog: $("scoringDialog"),
      historyDialog: $("historyDialog"), historyList: $("historyList"), newAuditButton: $("newAuditButton"), toast: $("toast"), printReport: $("printReport"),
    });
    try {
      db = await openDatabase();
      const audits = await listAudits();
      audit = audits[0] || createAudit();
      if (!audits.length) await saveNow();
      bindEvents();
      navigate("meta");
    } catch (error) {
      console.error(error);
      document.body.innerHTML = `<div style="max-width:560px;margin:80px auto;padding:24px;font-family:Tahoma"><h1>ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูล</h1><p>กรุณาเปิดแอปผ่านเบราว์เซอร์ปกติ หรือใช้คำสั่ง <code>npm start</code> แล้วเปิด http://127.0.0.1:4173</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
