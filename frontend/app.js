const API_URL = "http://localhost:3000/api";
let forms = [];

let currentFormId = null;
let selectedCreationMode = 'scratch';
let isEditingFormMode = false;
let editingRouteIndex = null;
let editingQuestionId = null;

/* ==========================================
   1. DATABASE LOADING & DASHBOARD
   ========================================== */
async function loadFormsFromDatabase() {
  try {
    const res = await fetch(`${API_URL}/forms`);
    if (!res.ok) throw new Error("Failed to fetch forms");
    const data = await res.json();

    forms = data.map(row => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      status: row.status,
      includeHeadlineDesc: row.include_headline_desc,
      hasHeadline: row.has_headline,
      hasDescription: row.has_description,
      headline: row.headline,
      description: row.description,
      questions: row.questions || [],
      routes: row.routes || [],
      destinationType: row.destination_type,
      destination: row.destination,
      responses: []
    }));

    renderDashboardGrid();
  } catch (err) {
    console.error("Could not load from PostgreSQL:", err);
  }
}

function renderDashboardGrid() {
  const grid = document.getElementById("forms-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (forms.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--text-muted); background: var(--surface); border: 1px dashed var(--border); border-radius: 16px;">
        <div style="font-size: 32px; margin-bottom: 10px;">📋</div>
        <div style="font-size: 14.5px; font-weight: 600; margin-bottom: 4px; color: var(--text);">No smart forms yet</div>
        <div style="font-size: 12.5px;">Click <strong>+ New smart form</strong> to create your first routing form.</div>
      </div>
    `;
    return;
  }

  forms.forEach(form => {
    const card = document.createElement("div");
    card.className = "form-square-card";
    card.onclick = () => openCardOptionsModal(form.id);

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
          <span class="badge badge-published">${form.status}</span>
          <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 500;">${form.responsesCount || 0} responses</span>
        </div>
        <h3 style="font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; word-break: break-word;">${form.name}</h3>
        <div style="font-size: 12px; color: var(--text-muted);">Created by ${form.createdBy}</div>
      </div>
      <div style="border-top: 1px solid var(--border); padding-top: 14px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11.5px; color: var(--text-muted);">${form.lastResponse ? form.lastResponse : 'No responses yet'}</span>
        <span style="font-size: 18px; font-weight: 700; color: var(--text-muted); line-height: 1;">&vellip;</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openCardOptionsModal(formId) {
  currentFormId = formId;
  const form = forms.find(f => f.id === formId);
  if (form) {
    document.getElementById("options-modal-title").textContent = form.name;
  }
  openModal("modal-card-options");
}

function handleCardAction(action) {
  closeModal("modal-card-options");
  if (!currentFormId) return;

  if (action === 'edit') {
    openFormBuilder(currentFormId, true);
  } else if (action === 'share') {
    openShareModal(currentFormId);
  } else if (action === 'rename') {
    triggerRenameModal(currentFormId);
  } else if (action === 'clone') {
    cloneForm(currentFormId);
  } else if (action === 'export') {
    exportFormResults(currentFormId);
  } else if (action === 'responses') {
    viewFormResponses(currentFormId);
  } else if (action === 'delete') {
    deleteForm(currentFormId);
  }
}

window.addEventListener("click", (e) => {
  if (!e.target.closest(".action-cell")) {
    closeAllMenus();
  }
});

function closeAllMenus() {
  document.querySelectorAll(".menu-popover").forEach(m => m.classList.remove("open"));
}

/* ==========================================
   2. FORM CREATION & PERSISTENCE
   ========================================== */
function openCreateFormModal() {
  selectedCreationMode = 'scratch';
  document.getElementById("input-form-name").value = "";
  document.getElementById("create-modal-header-title").textContent = "Create a new smart form";
  
  document.getElementById("create-modal-step-1").style.display = "block";
  document.getElementById("create-modal-footer-1").style.display = "flex";
  document.getElementById("create-modal-step-2").style.display = "none";
  document.getElementById("create-modal-footer-2").style.display = "none";

  openModal("modal-create-form");
}

function selectCreationPath(mode) {
  selectedCreationMode = mode;
  document.getElementById("create-modal-step-1").style.display = "none";
  document.getElementById("create-modal-footer-1").style.display = "none";

  document.getElementById("create-modal-step-2").style.display = "block";
  document.getElementById("create-modal-footer-2").style.display = "flex";

  if (mode === 'import') {
    document.getElementById("create-modal-header-title").textContent = "Import an existing form";
    document.getElementById("lbl-form-name").textContent = "Name your imported form";
    document.getElementById("input-form-name").placeholder = "e.g. Imported Assessment Form";
    document.getElementById("import-details-box").style.display = "block";
  } else {
    document.getElementById("create-modal-header-title").textContent = "Name your smart form";
    document.getElementById("lbl-form-name").textContent = "Name your smart form";
    document.getElementById("input-form-name").placeholder = "e.g. Client Intake Assessment";
    document.getElementById("import-details-box").style.display = "none";
  }
}

function backToStep1() {
  document.getElementById("create-modal-header-title").textContent = "Create a new smart form";
  document.getElementById("create-modal-step-1").style.display = "block";
  document.getElementById("create-modal-footer-1").style.display = "flex";
  document.getElementById("create-modal-step-2").style.display = "none";
  document.getElementById("create-modal-footer-2").style.display = "none";
}

async function submitCreateForm() {
  const name = document.getElementById("input-form-name").value.trim();
  if (!name) {
    alert("Please enter a form name.");
    return;
  }

  const newId = "form-" + Date.now();
  const defaultQuestions = selectedCreationMode === 'import' ? [
    { id: "q-imp-1", label: "Consultation Requirement", type: "dropdown", mandatory: true, options: ["High Priority", "Regular Assessment", "Follow-up"] },
    { id: "q-imp-2", label: "Preferred Time Window", type: "radio", mandatory: false, options: ["Morning Session", "Evening Session"] }
  ] : [];

  const newForm = {
    id: newId,
    name: name,
    createdBy: "You",
    status: "Published",
    includeHeadlineDesc: false,
    hasHeadline: true,
    hasDescription: true,
    headline: "",
    description: "",
    questions: defaultQuestions,
    routes: [],
    destinationType: "event",
    destination: "Exploratory Call with Ajay Yadava"
  };

  try {
    const res = await fetch(`${API_URL}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm)
    });

    if (!res.ok) throw new Error("Server error saving form");

    closeModal("modal-create-form");
    showToast("Smart form saved to PostgreSQL");
    await loadFormsFromDatabase();

    isEditingFormMode = false;
    openFormBuilder(newId, false);
    switchBuilderTab('form');
  } catch (err) {
    alert("Error saving form: " + err.message);
  }
}

function triggerRenameModal(formId) {
  closeAllMenus();
  const form = forms.find(f => f.id === formId);
  if (!form) return;
  currentFormId = formId;
  document.getElementById("input-rename-val").value = form.name;
  openModal("modal-rename-form");
}

async function submitRenameForm() {
  const newName = document.getElementById("input-rename-val").value.trim();
  if (!newName) return;
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.name = newName;
    await saveFormStudio();
    await loadFormsFromDatabase();
    showToast("Form renamed");
  }
  closeModal("modal-rename-form");
}

async function cloneForm(formId) {
  closeAllMenus();
  const form = forms.find(f => f.id === formId);
  if (!form) return;

  const cloned = JSON.parse(JSON.stringify(form));
  cloned.id = "form-" + Date.now();
  cloned.name = form.name + " (Copy)";

  try {
    const res = await fetch(`${API_URL}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloned)
    });
    if (!res.ok) throw new Error("Failed to clone form");
    await loadFormsFromDatabase();
    showToast("Form cloned to database");
  } catch (err) {
    alert("Error cloning form: " + err.message);
  }
}

async function deleteForm(formId) {
  closeAllMenus();
  if (!confirm("Are you sure you want to delete this smart form?")) return;

  try {
    const res = await fetch(`${API_URL}/forms/${formId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete form");
    await loadFormsFromDatabase();
    showToast("Form deleted from PostgreSQL");
  } catch (err) {
    alert("Error deleting form: " + err.message);
  }
}

/* ==========================================
   3. BUILDER NAVIGATION & DATABASE UPDATES
   ========================================== */
function openFormBuilder(formId, isEdit = true) {
  closeAllMenus();
  currentFormId = formId;
  isEditingFormMode = isEdit;
  const form = forms.find(f => f.id === formId);
  if (!form) return;

  document.getElementById("builder-form-title").textContent = form.name;
  document.getElementById("builder-form-subtitle").textContent = isEdit ? "Last edited today by You." : "Created just now.";

  const scheduleBtn = document.getElementById("btn-schedule-meeting");
  const nextBtn = document.getElementById("btn-form-next");
  if (scheduleBtn) scheduleBtn.style.display = isEdit ? "inline-flex" : "none";
  if (nextBtn) nextBtn.style.display = isEdit ? "none" : "inline-flex";

  const toggle = document.getElementById("toggle-headline-desc");
  toggle.checked = !!form.includeHeadlineDesc;
  document.getElementById("headline-description-card").style.display = form.includeHeadlineDesc ? "block" : "none";
  document.getElementById("input-headline").value = form.headline || "";
  document.getElementById("input-description").value = form.description || "";
  updateHeadlineDescUI();

  renderQuestions();
  renderRoutesOverview();
  initLogicTree();
  renderResponsesTable();

  document.getElementById("view-dashboard").classList.remove("active");
  document.getElementById("view-builder").classList.add("active");

  closeRouteBuilder();
  switchBuilderTab('form');
}

function showDashboard() {
  document.getElementById("view-builder").classList.remove("active");
  document.getElementById("view-dashboard").classList.add("active");
  renderDashboardGrid();
}

function switchBuilderTab(tabKey) {
  document.querySelectorAll(".builder-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".builder-panel").forEach(p => p.classList.remove("active"));

  const targetTab = document.getElementById(`tab-${tabKey}`);
  const targetPanel = document.getElementById(`panel-${tabKey}`);
  if (targetTab) targetTab.classList.add("active");
  if (targetPanel) targetPanel.classList.add("active");

  if (tabKey === "logic") {
    if (isEditingFormMode) {
      closeRouteBuilder();
      renderRoutesOverview();
    } else {
      openRouteBuilder();
    }
    initLogicTree();
  }
}

function toggleHeadlineDescription(enabled) {
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.includeHeadlineDesc = enabled;
    if (enabled) {
      if (form.hasHeadline === undefined) form.hasHeadline = true;
      if (form.hasDescription === undefined) form.hasDescription = true;
      if (!form.hasHeadline && !form.hasDescription) {
        form.hasHeadline = true;
        form.hasDescription = true;
      }
    }
  }
  document.getElementById("headline-description-card").style.display = enabled ? "block" : "none";
  updateHeadlineDescUI();
}

function deleteHeadlineBox() {
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.hasHeadline = false;
    form.headline = "";
  }
  document.getElementById("input-headline").value = "";
  updateHeadlineDescUI();
  showToast("Headline removed");
}

function restoreHeadlineBox() {
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.hasHeadline = true;
  }
  updateHeadlineDescUI();
  showToast("Headline added");
}

function deleteDescriptionBox() {
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.hasDescription = false;
    form.description = "";
  }
  document.getElementById("input-description").value = "";
  updateHeadlineDescUI();
  showToast("Description removed");
}

function restoreDescriptionBox() {
  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    form.hasDescription = true;
  }
  updateHeadlineDescUI();
  showToast("Description added");
}

function updateHeadlineDescUI() {
  const form = forms.find(f => f.id === currentFormId);
  const hasHeadline = form ? (form.hasHeadline !== false) : true;
  const hasDescription = form ? (form.hasDescription !== false) : true;

  const headlineBox = document.getElementById("headline-box");
  const addHeadlineBtn = document.getElementById("add-headline-btn-wrap");
  const descBox = document.getElementById("description-box");
  const addDescBtn = document.getElementById("add-description-btn-wrap");

  if (headlineBox && addHeadlineBtn) {
    headlineBox.style.display = hasHeadline ? "block" : "none";
    addHeadlineBtn.style.display = hasHeadline ? "none" : "block";
  }
  if (descBox && addDescBtn) {
    descBox.style.display = hasDescription ? "block" : "none";
    addDescBtn.style.display = hasDescription ? "none" : "block";
  }
}

function updateHeadline(val) {
  const form = forms.find(f => f.id === currentFormId);
  if (form) form.headline = val;
}

function updateDescription(val) {
  const form = forms.find(f => f.id === currentFormId);
  if (form) form.description = val;
}

async function saveFormStudio() {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;

  try {
    const res = await fetch(`${API_URL}/forms/${currentFormId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    if (!res.ok) throw new Error("Server error updating form");
    showToast("Changes saved to PostgreSQL");
  } catch (err) {
    alert("Error updating form: " + err.message);
  }
}

/* ==========================================
   4. QUESTIONS
   ========================================== */
function renderQuestions() {
  const container = document.getElementById("questions-list-container");
  const form = forms.find(f => f.id === currentFormId);
  if (!form || !container) return;

  if (!form.questions || form.questions.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = form.questions.map((q) => {
    const typeDisplay = q.type.charAt(0).toUpperCase() + q.type.slice(1);
    let inputFieldHtml = '';
    if (q.type === 'dropdown') {
      inputFieldHtml = `
        <select style="margin-top: 6px;">
          <option value="">Select...</option>
          ${(q.options || []).map(o => `<option>${o}</option>`).join("")}
        </select>`;
    } else if (q.type === 'radio') {
      inputFieldHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
          ${(q.options || []).map(o => `
            <label style="font-weight: normal; display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="radio" name="builder-question-${q.id}" value="${o}"> ${o}
            </label>
          `).join("")}
        </div>`;
    } else if (q.type === 'paragraph') {
      inputFieldHtml = `<textarea rows="2" style="margin-top: 6px;" placeholder="Enter your answer"></textarea>`;
    } else {
      inputFieldHtml = `<input type="text" style="margin-top: 6px;" placeholder="Enter your answer">`;
    }

    return `
      <div class="question-row">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div>
            <span class="field-tag">${typeDisplay}</span>
            <div style="font-weight: 500;">
              ${q.label} ${q.mandatory ? '<span style="color: var(--danger);">*</span>' : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge">${q.mandatory ? "Required" : "Optional"}</span>
            <button class="btn btn-secondary btn-sm" onclick="openEditQuestionModal('${q.id}')">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="deleteQuestion('${q.id}')">Delete</button>
          </div>
        </div>
        ${inputFieldHtml}
      </div>
    `;
  }).join("");
}

function appendOptionRow(val = "") {
  const list = document.getElementById("modal-options-list");
  if (!list) return;
  const div = document.createElement("div");
  div.className = "option-item";
  div.innerHTML = `
    <input type="text" placeholder="Option ${list.children.length + 1}" value="${val}" class="q-opt-input" style="flex: 1;">
    <button type="button" class="icon-btn" onclick="removeOptionRow(this)" title="Delete choice" style="width: 32px; height: 32px; font-size: 16px; color: var(--text-muted);">&times;</button>
  `;
  list.appendChild(div);
}

function removeOptionRow(btn) {
  const list = document.getElementById("modal-options-list");
  if (list && list.children.length <= 1) {
    alert("A choice question must have at least one choice.");
    return;
  }
  btn.closest(".option-item").remove();
}

function openAddQuestionModal() {
  editingQuestionId = null;
  document.getElementById("question-modal-title").textContent = "Add question";
  document.getElementById("input-q-type").value = "dropdown";
  document.getElementById("input-q-label").value = "";
  document.getElementById("input-q-mandatory").checked = true;
  document.getElementById("question-options-group").style.display = "block";
  
  const optionsList = document.getElementById("modal-options-list");
  optionsList.innerHTML = "";
  appendOptionRow();
  appendOptionRow();

  openModal("modal-add-question");
}

function openEditQuestionModal(questionId) {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;
  const q = form.questions.find(item => item.id === questionId);
  if (!q) return;

  editingQuestionId = questionId;
  document.getElementById("question-modal-title").textContent = "Edit question";
  document.getElementById("input-q-type").value = q.type;
  document.getElementById("input-q-label").value = q.label;
  document.getElementById("input-q-mandatory").checked = !!q.mandatory;

  handleQuestionTypeChange(q.type);

  const optionsList = document.getElementById("modal-options-list");
  optionsList.innerHTML = "";
  if (q.options && q.options.length > 0) {
    q.options.forEach(opt => appendOptionRow(opt));
  } else {
    appendOptionRow();
    appendOptionRow();
  }

  openModal("modal-add-question");
}

function handleQuestionTypeChange(type) {
  const optGroup = document.getElementById("question-options-group");
  optGroup.style.display = (type === "dropdown" || type === "radio") ? "block" : "none";
}

function submitAddQuestion() {
  const type = document.getElementById("input-q-type").value;
  const label = document.getElementById("input-q-label").value.trim();
  const mandatory = document.getElementById("input-q-mandatory").checked;

  if (!label) {
    alert("Please enter the question.");
    return;
  }

  let parsedOptions = [];
  if (type === "dropdown" || type === "radio") {
    const inputs = Array.from(document.querySelectorAll(".q-opt-input"));
    parsedOptions = inputs.map(i => i.value.trim()).filter(v => v.length > 0);
    if (parsedOptions.length < 1) {
      alert("Dropdown and Radio questions require at least one choice.");
      return;
    }
  }

  const form = forms.find(f => f.id === currentFormId);
  if (form) {
    if (editingQuestionId) {
      const q = form.questions.find(item => item.id === editingQuestionId);
      if (q) {
        q.type = type;
        q.label = label;
        q.mandatory = mandatory;
        q.options = parsedOptions;
        showToast("Question updated");
      }
    } else {
      form.questions.push({
        id: "q-" + Date.now(),
        label: label,
        type: type,
        mandatory: mandatory,
        options: parsedOptions
      });
      showToast("Question added");
    }
    renderQuestions();
    initLogicTree();
  }
  closeModal("modal-add-question");
}

function deleteQuestion(questionId) {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;
  form.questions = form.questions.filter(q => q.id !== questionId);
  renderQuestions();
  initLogicTree();
  showToast("Question removed");
}

/* ==========================================
   5. LOGIC ENGINE & ROUTES
   ========================================== */
function handleDestinationTypeChange(type) {
  document.getElementById("dest-type-event-wrap").style.display = (type === 'event') ? 'block' : 'none';
  document.getElementById("dest-type-message-wrap").style.display = (type === 'message') ? 'block' : 'none';
  document.getElementById("dest-type-url-wrap").style.display = (type === 'url') ? 'block' : 'none';
}

function generateSummaryFromBuilder() {
  const form = forms.find(f => f.id === currentFormId);
  const nodes = document.querySelectorAll("#logic-nodes-list .logic-branch-node");
  const parts = [];

  nodes.forEach((node, idx) => {
    const nodeType = node.getAttribute("data-node-type") || (idx === 0 ? "IF" : "AND");
    const qSelect = node.querySelector(".logic-q-select");
    const qId = qSelect ? qSelect.value : "";
    const qObj = form && form.questions ? form.questions.find(q => q.id === qId) : null;
    const qLabel = qObj ? qObj.label : (qSelect && qSelect.options[qSelect.selectedIndex] ? qSelect.options[qSelect.selectedIndex].text : "Question");

    const valSelects = Array.from(node.querySelectorAll(".value-select"));
    const vals = valSelects.map(v => v.value.trim()).filter(v => v.length > 0);

    if (qLabel && qLabel !== "Choose a question") {
      let clause = "";
      if (idx === 0) {
        clause = `If "${qLabel}" is `;
      } else if (nodeType === "OR IF") {
        clause = ` or if "${qLabel}" is `;
      } else {
        clause = ` and "${qLabel}" is `;
      }

      if (vals.length > 0) {
        clause += vals.map(val => `<strong>${val}</strong>`).join(" or ");
      } else {
        clause += `<strong>(any answer)</strong>`;
      }
      parts.push(clause);
    }
  });

  if (parts.length === 0) {
    return `If form follows condition then go to`;
  }

  return parts.join("") + " then go to";
}

function renderRoutesOverview() {
  const form = forms.find(f => f.id === currentFormId);
  const container = document.getElementById("active-routes-container");
  if (!form || !container) return;

  if (!form.routes || form.routes.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No active routes configured yet. Click <strong>+ Create</strong> to add your first route.
      </div>
    `;
    return;
  }

  container.innerHTML = form.routes.map((route, idx) => `
    <div class="route-item-card">
      <span class="route-num">${idx + 1}</span>
      <span class="route-grip">⠿</span>
      <div style="flex: 1;">
        <div style="font-size: 12.5px; color: var(--text); line-height: 1.45;">
          ${route.summaryHtml}
        </div>

        <div class="route-destination-badge">
          <div>
            <div style="font-weight: 600; font-size: 13px;">${route.destinationTitle}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${route.destSubtitle || '15 mins, One-on-One'}</div>
          </div>
          <div class="avatar-circle">${route.avatar || 'A'}</div>
        </div>
      </div>

      <div class="action-cell">
        <button class="icon-btn" onclick="toggleRouteItemMenu(event, '${idx}')" title="Options">&vellip;</button>
        <div class="menu-popover" id="route-item-popover-${idx}">
          <button class="menu-item" onclick="openRouteBuilder(${idx})">✏️ Edit route</button>
          <button class="menu-item" onclick="cloneCurrentRoute(${idx})">📋 Clone route</button>
          <button class="menu-item danger-item" onclick="deleteCurrentRoute(${idx})">🗑️ Delete route</button>
        </div>
      </div>
    </div>
  `).join("");
}

function openRouteBuilder(routeIndex = null) {
  closeAllMenus();
  editingRouteIndex = routeIndex;
  document.getElementById("logic-routes-overview").style.display = "none";
  document.getElementById("logic-route-builder").style.display = "block";
  initLogicTree();
}

function closeRouteBuilder() {
  document.getElementById("logic-route-builder").style.display = "none";
  document.getElementById("logic-routes-overview").style.display = "block";
}

function handleBackFromRouteBuilder() {
  if (isEditingFormMode) {
    closeRouteBuilder();
    renderRoutesOverview();
  } else {
    switchBuilderTab('form');
  }
}

function toggleRouteItemMenu(event, idx) {
  event.stopPropagation();
  closeAllMenus();
  const popover = document.getElementById(`route-item-popover-${idx}`);
  if (popover) {
    popover.classList.toggle("open");
  }
}

function cloneCurrentRoute(idx) {
  closeAllMenus();
  const form = forms.find(f => f.id === currentFormId);
  if (form && form.routes && form.routes[idx]) {
    const cloned = JSON.parse(JSON.stringify(form.routes[idx]));
    cloned.id = "route-" + Date.now();
    form.routes.splice(idx + 1, 0, cloned);
    renderRoutesOverview();
    showToast("Route cloned");
  }
}

function deleteCurrentRoute(idx) {
  closeAllMenus();
  const form = forms.find(f => f.id === currentFormId);
  if (form && form.routes) {
    if (confirm("Are you sure you want to delete this route?")) {
      form.routes.splice(idx, 1);
      renderRoutesOverview();
      showToast("Route deleted");
    }
  }
}

function getChoiceQuestions() {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return [];
  return form.questions.filter(q => q.type === "dropdown" || q.type === "radio");
}

function initLogicTree() {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;

  const choiceQuestions = getChoiceQuestions();
  document.querySelectorAll(".logic-q-select").forEach(sel => {
    const curVal = sel.value;
    sel.innerHTML = `<option value="">Choose a question</option>` +
      choiceQuestions.map(q => `<option value="${q.id}">${q.label}</option>`).join("");
    if (curVal) sel.value = curVal;
  });

  if (form.destinationType) {
    document.getElementById("logic-destination-type").value = form.destinationType;
    handleDestinationTypeChange(form.destinationType);
  }

  if (form.destination) {
    if (form.destinationType === 'event') {
      const eventSelect = document.getElementById("logic-event-type-select");
      if (eventSelect) eventSelect.value = form.destination;
    } else if (form.destinationType === 'message') {
      document.getElementById("logic-custom-message-input").value = form.destination;
    } else if (form.destinationType === 'url') {
      document.getElementById("logic-external-url-input").value = form.destination;
    }
  }
}

function handleLogicQuestionChange(selectEl) {
  const box = selectEl.closest(".logic-box-body");
  const questionId = selectEl.value;
  const form = forms.find(f => f.id === currentFormId);
  const q = form ? form.questions.find(item => item.id === questionId) : null;

  const valSelects = box.querySelectorAll(".value-select");
  const opSelects = box.querySelectorAll(".operator-select");

  valSelects.forEach(valSel => {
    if (!q || !q.options || q.options.length === 0) {
      valSel.innerHTML = `<option value="">Select option</option>`;
      valSel.style.background = "#f1f5f9";
    } else {
      valSel.style.background = "#ffffff";
      valSel.innerHTML = `<option value="">Select option</option>` +
        q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
    }
  });

  opSelects.forEach(opSel => {
    opSel.style.background = questionId ? "#ffffff" : "#f1f5f9";
  });
}

function addAndBlock(btn) {
  const currentNode = btn.closest(".logic-branch-node");
  const choiceQuestions = getChoiceQuestions();

  const andNode = document.createElement("div");
  andNode.className = "logic-branch-node";
  andNode.setAttribute("data-node-type", "AND");
  andNode.innerHTML = `
    <div class="rail-badge">AND</div>
    <div class="logic-box">
      <div class="logic-box-head">
        <span class="logic-box-title">the form follows this condition</span>
        <span class="info-circle" title="Information">ⓘ</span>
      </div>
      <div class="logic-box-body">
        <select class="logic-q-select" onchange="handleLogicQuestionChange(this)">
          <option value="">Choose a question</option>
          ${choiceQuestions.map(q => `<option value="${q.id}">${q.label}</option>`).join("")}
        </select>

        <div class="logic-conditions-list">
          <div class="logic-row">
            <select class="operator-select" style="background: #f1f5f9;">
              <option value="is">is</option>
              <option value="is_not">is not</option>
            </select>
            <select class="value-select" style="background: #f1f5f9;">
              <option value="">Select option</option>
            </select>
            <button class="btn-pill-action" type="button" onclick="addOrRow(this)">+ or</button>
            <button class="trash-btn" type="button" onclick="removeLogicRowOrNode(this)" title="Delete">🗑</button>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <button class="btn-pill-action" type="button" onclick="addAndBlock(this)">+ and</button>
        </div>
      </div>
    </div>
  `;

  currentNode.parentNode.insertBefore(andNode, currentNode.nextSibling);
}

function addOrIfBlock() {
  const container = document.getElementById("logic-nodes-list");
  const choiceQuestions = getChoiceQuestions();

  const orIfNode = document.createElement("div");
  orIfNode.className = "logic-branch-node";
  orIfNode.setAttribute("data-node-type", "OR IF");
  orIfNode.innerHTML = `
    <div class="rail-badge rail-badge-lg">OR IF</div>
    <div class="logic-box">
      <div class="logic-box-head">
        <span class="logic-box-title">the form follows this condition</span>
        <span class="info-circle" title="Information">ⓘ</span>
      </div>
      <div class="logic-box-body">
        <select class="logic-q-select" onchange="handleLogicQuestionChange(this)">
          <option value="">Choose a question</option>
          ${choiceQuestions.map(q => `<option value="${q.id}">${q.label}</option>`).join("")}
        </select>

        <div class="logic-conditions-list">
          <div class="logic-row">
            <select class="operator-select" style="background: #f1f5f9;">
              <option value="is">is</option>
              <option value="is_not">is not</option>
            </select>
            <select class="value-select" style="background: #f1f5f9;">
              <option value="">Select option</option>
            </select>
            <button class="btn-pill-action" type="button" onclick="addOrRow(this)">+ or</button>
            <button class="trash-btn" type="button" onclick="removeLogicRowOrNode(this)" title="Delete">🗑</button>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <button class="btn-pill-action" type="button" onclick="addAndBlock(this)">+ and</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(orIfNode);
}

function addOrRow(btn) {
  const box = btn.closest(".logic-box-body");
  const conditionsList = box.querySelector(".logic-conditions-list");
  const qSelect = box.querySelector(".logic-q-select");
  const questionId = qSelect ? qSelect.value : "";
  const form = forms.find(f => f.id === currentFormId);
  const q = form ? form.questions.find(item => item.id === questionId) : null;

  const optsHtml = (q && q.options && q.options.length) 
    ? `<option value="">Select option</option>` + q.options.map(opt => `<option value="${opt}">${opt}</option>`).join("")
    : `<option value="">Select option</option>`;

  const orRow = document.createElement("div");
  orRow.className = "logic-row";
  orRow.innerHTML = `
    <div class="or-badge">OR</div>
    <select class="value-select" style="${questionId ? 'background:#ffffff;' : 'background:#f1f5f9;'}">
      ${optsHtml}
    </select>
    <button class="btn-pill-action" type="button" onclick="addOrRow(this)">+ or</button>
    <button class="trash-btn" type="button" onclick="removeLogicRowOrNode(this)" title="Delete">🗑</button>
  `;

  conditionsList.appendChild(orRow);
}

function removeLogicRowOrNode(btn) {
  const row = btn.closest(".logic-row");
  const conditionsList = btn.closest(".logic-conditions-list");
  const node = btn.closest(".logic-branch-node");
  const nodeType = node ? node.getAttribute("data-node-type") : "";

  if (row && row.querySelector(".or-badge")) {
    row.remove();
    return;
  }

  if (nodeType === "AND" || nodeType === "OR IF") {
    node.remove();
    return;
  }

  if (nodeType === "IF") {
    const qSelect = node.querySelector(".logic-q-select");
    if (qSelect) qSelect.value = "";
    handleLogicQuestionChange(qSelect);
    const orRows = conditionsList.querySelectorAll(".or-badge");
    orRows.forEach(orEl => orEl.closest(".logic-row").remove());
  }
}

function saveLogicRoute() {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;

  if (!form.routes) form.routes = [];

  const summaryHtml = generateSummaryFromBuilder();
  const destType = document.getElementById("logic-destination-type").value;
  let destinationVal = "";
  let destSubtitle = "";
  let avatarChar = "A";

  if (destType === "event") {
    destinationVal = document.getElementById("logic-event-type-select").value || "Exploratory Call with Ajay Yadava";
    destSubtitle = "15 mins, One-on-One";
    avatarChar = destinationVal.charAt(0).toUpperCase() || 'A';
  } else if (destType === "message") {
    destinationVal = document.getElementById("logic-custom-message-input").value.trim() || "We'll email you within 24 hours.";
    destSubtitle = "Display custom message";
    avatarChar = "M";
  } else if (destType === "url") {
    destinationVal = document.getElementById("logic-external-url-input").value.trim() || "https://example.com/pricing";
    destSubtitle = "Redirect to URL";
    avatarChar = "🔗";
  }

  const nodes = document.querySelectorAll("#logic-nodes-list .logic-branch-node");
  const structuredConditions = [];
  nodes.forEach(node => {
    const qSelect = node.querySelector(".logic-q-select");
    const questionId = qSelect ? qSelect.value : "";
    const opSelect = node.querySelector(".operator-select");
    const operator = opSelect ? opSelect.value : "is";
    const valSelects = Array.from(node.querySelectorAll(".value-select"));
    const values = valSelects.map(v => v.value.trim()).filter(v => v.length > 0);

    if (questionId && values.length > 0) {
      structuredConditions.push({ questionId, operator, values });
    }
  });

  const newRoute = {
    id: "route-" + Date.now(),
    summaryHtml: summaryHtml,
    destinationType: destType,
    destinationTitle: destinationVal,
    destSubtitle: destSubtitle,
    avatar: avatarChar,
    conditions: structuredConditions
  };

  if (editingRouteIndex !== null && form.routes[editingRouteIndex]) {
    form.routes[editingRouteIndex] = newRoute;
  } else {
    form.routes.push(newRoute);
  }

  form.destinationType = destType;
  form.destination = destinationVal;
  showToast("Route saved successfully");
  renderRoutesOverview();
  closeRouteBuilder();
}

/* ==========================================
   6. RESPONSES, PREVIEW & SUBMISSIONS
   ========================================== */
function viewFormResponses(formId) {
  openFormBuilder(formId, true);
  switchBuilderTab("responses");
}

function renderResponsesTable() {
  const tbody = document.getElementById("responses-table-body");
  const form = forms.find(f => f.id === currentFormId);
  if (!form || !tbody) return;

  if (!form.responses || form.responses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No responses logged yet for this form.</td></tr>`;
    return;
  }

  tbody.innerHTML = form.responses.map(r => `
    <tr>
      <td>${r.timestamp}</td>
      <td><strong>${r.name}</strong></td>
      <td>${r.email}</td>
      <td>${r.phone}</td>
      <td>${r.summary || "—"}</td>
      <td><span class="badge">${r.routedTo}</span></td>
    </tr>
  `).join("");
}

function exportFormResults(formId) {
  closeAllMenus();
  const form = forms.find(f => f.id === formId);
  if (!form) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(form.responses, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${form.name.toLowerCase().replace(/\s+/g, '_')}_results.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Results exported");
}

function exportCurrentResponses() {
  exportFormResults(currentFormId);
}

function openShareModal(formId) {
  closeAllMenus();
  currentFormId = formId;
  const form = forms.find(f => f.id === formId);
  if (!form) return;

  const generatedUrl = `${window.location.origin}/forms/s/${form.id}`;
  document.getElementById("share-link-input").value = generatedUrl;
  openModal("modal-share-form");
}

function copyShareLink() {
  const copyText = document.getElementById("share-link-input");
  copyText.select();
  copyText.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(copyText.value);
  showToast("Link copied");
}

function evaluatePreviewRouting() {
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return "Custom message";

  const previewForm = document.getElementById("respondent-test-form");
  const formData = new FormData(previewForm);

  let matchedDestination = null;

  if (form.routes && form.routes.length > 0) {
    for (const route of form.routes) {
      if (!route.conditions || route.conditions.length === 0) continue;

      let matches = true;
      for (const cond of route.conditions) {
        const userVal = formData.get(cond.questionId);
        const containsVal = cond.values.includes(userVal);
        if (cond.operator === "is" && !containsVal) {
          matches = false;
          break;
        } else if (cond.operator === "is_not" && containsVal) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchedDestination = route.destinationTitle;
        break;
      }
    }
  }

  if (!matchedDestination) {
    matchedDestination = (form.routes && form.routes.length > 0) ? "Book a 15 mins call with me" : (form.destination || "Custom message");
  }

  const labelEl = document.getElementById("preview-routing-logic-label");
  if (labelEl) {
    labelEl.textContent = matchedDestination;
  }

  return matchedDestination;
}

function simulateRespondentModal() {
  closeModal("modal-share-form");
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;

  document.getElementById("preview-form-title").textContent = form.name;
  document.getElementById("respondent-test-form").reset();
  document.getElementById("respondent-test-form").style.display = "block";
  document.getElementById("preview-result-container").style.display = "none";

  const headlineBox = document.getElementById("preview-headline-box");
  const showHeadline = form.includeHeadlineDesc && (form.hasHeadline !== false) && form.headline;
  const showDesc = form.includeHeadlineDesc && (form.hasDescription !== false) && form.description;

  if (showHeadline || showDesc) {
    headlineBox.style.display = "block";
    document.getElementById("preview-headline-text").textContent = showHeadline ? form.headline : "";
    document.getElementById("preview-desc-text").textContent = showDesc ? form.description : "";
  } else {
    headlineBox.style.display = "none";
  }

  const container = document.getElementById("preview-dynamic-fields");
  container.innerHTML = form.questions.map(q => {
    if (q.type === "dropdown") {
      return `
        <div class="form-group">
          <label>${q.label} ${q.mandatory ? '*' : ''}</label>
          <select name="${q.id}" ${q.mandatory ? 'required' : ''} onchange="evaluatePreviewRouting()">
            <option value="">Select option...</option>
            ${q.options.map(o => `<option value="${o}">${o}</option>`).join("")}
          </select>
        </div>
      `;
    } else if (q.type === "radio") {
      return `
        <div class="form-group">
          <label>${q.label} ${q.mandatory ? '*' : ''}</label>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
            ${q.options.map((o, idx) => `
              <label style="font-weight: normal; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="${q.id}" value="${o}" ${q.mandatory && idx === 0 ? 'required' : ''} onchange="evaluatePreviewRouting()">
                ${o}
              </label>
            `).join("")}
          </div>
        </div>
      `;
    } else if (q.type === "paragraph") {
      return `
        <div class="form-group">
          <label>${q.label} ${q.mandatory ? '*' : ''}</label>
          <textarea name="${q.id}" rows="2" ${q.mandatory ? 'required' : ''} placeholder="Enter your answer"></textarea>
        </div>
      `;
    } else {
      return `
        <div class="form-group">
          <label>${q.label} ${q.mandatory ? '*' : ''}</label>
          <input type="text" name="${q.id}" ${q.mandatory ? 'required' : ''} placeholder="Enter your answer">
        </div>
      `;
    }
  }).join("");

  openModal("modal-preview-form");
  evaluatePreviewRouting();
}

async function handlePreviewSubmit(e) {
  e.preventDefault();
  const form = forms.find(f => f.id === currentFormId);
  if (!form) return;

  const formData = new FormData(e.target);
  const assignedDestination = evaluatePreviewRouting();

  const responsePayload = {
    form_id: form.id,
    name: formData.get("name") || "Anonymous",
    email: formData.get("email") || "—",
    phone: (formData.get("phone") || "").trim() || "—",
    routed_to: assignedDestination
  };

  try {
    const res = await fetch(`${API_URL}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(responsePayload)
    });

    if (!res.ok) throw new Error("Server error recording response");

    document.getElementById("respondent-test-form").style.display = "none";
    document.getElementById("preview-result-container").style.display = "block";
    document.getElementById("preview-matched-text").textContent = `Assigned to: ${assignedDestination}`;
    showToast("Response saved to PostgreSQL");
  } catch (err) {
    alert("Error saving response: " + err.message);
  }
}

function resetPreviewForm() {
  document.getElementById("respondent-test-form").reset();
  document.getElementById("respondent-test-form").style.display = "block";
  document.getElementById("preview-result-container").style.display = "none";
  evaluatePreviewRouting();
}

/* ==========================================
   7. MODAL HELPERS & INITIALIZATION
   ========================================== */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 1800);
}

window.addEventListener("DOMContentLoaded", () => {
  loadFormsFromDatabase();
});