// PlanWise - AI Student Planner
// This file wires up onboarding, task management, scheduling, calendar rendering, chatbot, and localStorage.

const STORAGE_KEY = "planwise_state_v1";

const PRIORITY_WEIGHTS = {
  "Urgent & Important": 1,
  "Urgent, Not Important": 2,
  "Important, Not Urgent": 3,
  "Not Urgent & Not Important": 4,
};

const PRODUCTIVE_TIME_WINDOWS = {
  "Early Morning": [6, 9],
  Morning: [9, 12],
  Afternoon: [12, 17],
  Evening: [17, 21],
  "Late Night": [21, 24],
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let state = {
  profile: null,
  tasks: [],
  rankedTasks: [],
  schedule: [], // array of {kind: 'task', taskId, start: Date ISO, end: Date ISO}
  fixedBlocks: [], // array of {kind: 'fixed', label, start, end, category}
};

// Currently edited task (if any)
let editingTaskId = null;

// ---------- Utility ----------

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Unable to persist state:", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state = parsed;
    // Backfill any missing task IDs from older data
    ensureTaskIds();
  } catch (e) {
    console.warn("Unable to load saved state:", e);
  }
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatMinutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function todayLocalISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function compareBy(a, b, key) {
  if (a[key] < b[key]) return -1;
  if (a[key] > b[key]) return 1;
  return 0;
}

// ---------- DOM Helpers ----------

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setStep(step) {
  $all(".wizard-step").forEach((el) => {
    el.classList.toggle("active", el.dataset.step === String(step));
  });
  $all(".wizard-step-indicator").forEach((el) => {
    el.classList.toggle("active", el.dataset.step === String(step));
  });
}

function showToast(message) {
  // Small, non-intrusive toast using alert as fallback for simplicity
  console.log("[PlanWise]", message);
}

// ---------- Initialization ----------

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initWeeklyScheduleInputs();
  initWeekendScheduleInputs();
  initDeadlineTimeOptions();
  initProfileInteractions();
  initTaskForm();
  initWizardButtons();
  initChatbot();
  initCalendarViewToggle();
  restoreFromState();
});

function initWeeklyScheduleInputs() {
  const container = $("#weekly_schedule");
  if (!container) return;
  container.innerHTML = "";
  ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {
    const wrapper = document.createElement("div");
    wrapper.className = "weekly-day";
    wrapper.dataset.day = day;
    wrapper.innerHTML = `
      <div class="weekly-day-header">${day}</div>
      <div class="weekly-commitments" data-day="${day}"></div>
      <button type="button" class="btn-add-commitment" data-day="${day}">+ Add commitment</button>
    `;
    container.appendChild(wrapper);
    
    // Add commitment button handler
    wrapper.querySelector(".btn-add-commitment").addEventListener("click", () => {
      addCommitmentRow(day);
    });
  });
}

function initWeekendScheduleInputs() {
  const container = $("#weekend_schedule");
  if (!container) return;
  container.innerHTML = "";
  ["Saturday", "Sunday"].forEach((day) => {
    const wrapper = document.createElement("div");
    wrapper.className = "weekend-day";
    wrapper.dataset.day = day;
    wrapper.innerHTML = `
      <div class="weekly-day-header">${day}</div>
      <div class="weekly-commitments" data-day="${day}"></div>
      <button type="button" class="btn-add-commitment" data-day="${day}">+ Add activity</button>
    `;
    container.appendChild(wrapper);
    
    // Add activity button handler
    wrapper.querySelector(".btn-add-commitment").addEventListener("click", () => {
      addCommitmentRow(day, true);
    });
  });
}

function addCommitmentRow(day, isWeekend = false) {
  const selector = isWeekend 
    ? `.weekly-commitments[data-day="${day}"]` 
    : `.weekly-commitments[data-day="${day}"]`;
  const commitmentsContainer = $(selector);
  if (!commitmentsContainer) return;
  
  const commitmentId = `commit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const row = document.createElement("div");
  row.className = "commitment-row";
  row.dataset.commitmentId = commitmentId;
  row.innerHTML = `
    <input type="text" class="commitment-name" placeholder="Name (e.g., Soccer Practice)" required />
    <input type="text" class="commitment-time" placeholder="Time range (e.g., 10:00-12:00)" required />
    <input type="text" class="commitment-desc" placeholder="Description (optional)" />
    <div class="commitment-row-actions">
      <button type="button" class="btn-remove-commitment">Remove</button>
    </div>
  `;
  commitmentsContainer.appendChild(row);
  
  row.querySelector(".btn-remove-commitment").addEventListener("click", () => {
    row.remove();
  });
}

function initDeadlineTimeOptions() {
  const select = $("#task_deadline_time");
  if (!select) return;
  select.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
  }
  select.value = "23:59";
}

function initProfileInteractions() {
  // Procrastinator yes/no buttons
  const procrastGroup = $("#is_procrastinator_group");
  if (procrastGroup) {
    procrastGroup.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      const val = e.target.dataset.value;
      $("#is_procrastinator").value = val;
      $all("#is_procrastinator_group button").forEach((btn) =>
        btn.classList.toggle("selected", btn === e.target),
      );
      $("#procrastinator_yes").classList.toggle("hidden", val !== "yes");
      $("#procrastinator_no").classList.toggle("hidden", val !== "no");
    });
  }

  const buttonGroups = [
    "#works_best_group",
    "#has_trouble_finishing_group",
  ];

  buttonGroups.forEach((selector) => {
    const group = $(selector);
    if (!group) return;
    group.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      const hidden = group.querySelector("input[type=hidden]");
      hidden.value = e.target.dataset.value;
      group
        .querySelectorAll("button")
        .forEach((btn) => btn.classList.toggle("selected", btn === e.target));
    });
  });

  const saveProfileBtn = $("#saveProfileBtn");
  saveProfileBtn?.addEventListener("click", () => {
    const profile = readProfileFromForm();
    if (!profile) return;
    state.profile = profile;
    saveState();
    showToast("Profile saved.");
    setStep(2);
  });
}

function readProfileFromForm() {
  const user_name = $("#user_name").value.trim();
  const user_age_group = $("#user_age_group").value;
  if (!user_name || !user_age_group) {
    alert("Please fill in your name and age group.");
    return null;
  }

  const weekly_schedule = {};
  ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {
    const commitments = [];
    $all(`.weekly-commitments[data-day="${day}"] .commitment-row`).forEach((row) => {
      const name = row.querySelector(".commitment-name").value.trim();
      const time = row.querySelector(".commitment-time").value.trim();
      const desc = row.querySelector(".commitment-desc").value.trim();
      if (name && time) {
        commitments.push({
          name,
          time,
          description: desc || null,
        });
      }
    });
    weekly_schedule[day] = commitments;
  });

  const weekend_schedule = {};
  ["Saturday", "Sunday"].forEach((day) => {
    const activities = [];
    $all(`.weekly-commitments[data-day="${day}"] .commitment-row`).forEach((row) => {
      const name = row.querySelector(".commitment-name").value.trim();
      const time = row.querySelector(".commitment-time").value.trim();
      const desc = row.querySelector(".commitment-desc").value.trim();
      if (name && time) {
        activities.push({
          name,
          time,
          description: desc || null,
        });
      }
    });
    weekend_schedule[day] = activities;
  });

  const profile = {
    user_name,
    user_age_group,
    weekly_schedule,
    weekend_schedule,
    sleep_weekdays: $("#sleep_weekdays").value.trim(),
    sleep_weekends: $("#sleep_weekends").value.trim(),
    break_times: $("#break_times").value.trim(),
    is_procrastinator: $("#is_procrastinator").value || null,
    procrastinator_type: $("#procrastinator_type").value || null,
    works_best: $("#works_best").value || null,
    has_trouble_finishing: $("#has_trouble_finishing").value || null,
    preferred_work_style: $("#preferred_work_style").value || null,
    most_productive_time: $("#most_productive_time").value || null,
    preferred_study_method: $("#preferred_study_method").value.trim(),
    weekly_personal_time: parseFloat($("#weekly_personal_time").value || "0"),
    weekly_review_hours: parseFloat($("#weekly_review_hours").value || "0"),
  };
  return profile;
}

function restoreProfileToForm() {
  if (!state.profile) return;
  const p = state.profile;
  $("#user_name").value = p.user_name || "";
  $("#user_age_group").value = p.user_age_group || "";

  // Restore weekly schedule commitments
  ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {
    const commitments = p.weekly_schedule?.[day];
    const commitmentsContainer = $(`.weekly-commitments[data-day="${day}"]`);
    if (!commitmentsContainer) return;
    
    // Clear existing
    commitmentsContainer.innerHTML = "";
    
    // If old format (string), convert to array format
    if (typeof commitments === "string" && commitments.trim()) {
      // Legacy: single time range string
      const row = document.createElement("div");
      row.className = "commitment-row";
      row.dataset.commitmentId = `legacy_${day}`;
      row.innerHTML = `
        <input type="text" class="commitment-name" placeholder="Name (e.g., Math Class)" value="Fixed commitment" />
        <input type="text" class="commitment-time" placeholder="Time range (e.g., 09:00-15:00)" value="${commitments}" />
        <input type="text" class="commitment-desc" placeholder="Description (optional)" />
        <div class="commitment-row-actions">
          <button type="button" class="btn-remove-commitment">Remove</button>
        </div>
      `;
      commitmentsContainer.appendChild(row);
      row.querySelector(".btn-remove-commitment").addEventListener("click", () => {
        row.remove();
      });
    } else if (Array.isArray(commitments)) {
      // New format: array of {name, time, description}
      commitments.forEach((commitment) => {
        const row = document.createElement("div");
        row.className = "commitment-row";
        row.dataset.commitmentId = `commit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        row.innerHTML = `
          <input type="text" class="commitment-name" placeholder="Name (e.g., Math Class)" value="${commitment.name || ""}" />
          <input type="text" class="commitment-time" placeholder="Time range (e.g., 09:00-15:00)" value="${commitment.time || ""}" />
          <input type="text" class="commitment-desc" placeholder="Description (optional)" value="${commitment.description || ""}" />
          <div class="commitment-row-actions">
            <button type="button" class="btn-remove-commitment">Remove</button>
          </div>
        `;
        commitmentsContainer.appendChild(row);
        row.querySelector(".btn-remove-commitment").addEventListener("click", () => {
          row.remove();
        });
      });
    }
  });

  $("#weekend_schedule").value = p.weekend_schedule || "";
  $("#sleep_weekdays").value = p.sleep_weekdays || "";
  $("#sleep_weekends").value = p.sleep_weekends || "";
  $("#break_times").value = p.break_times || "";

  if (p.is_procrastinator) {
    $("#is_procrastinator").value = p.is_procrastinator;
    const group = $("#is_procrastinator_group");
    group
      ?.querySelectorAll("button")
      .forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === p.is_procrastinator));
    $("#procrastinator_yes").classList.toggle("hidden", p.is_procrastinator !== "yes");
    $("#procrastinator_no").classList.toggle("hidden", p.is_procrastinator !== "no");
  }

  if (p.procrastinator_type) $("#procrastinator_type").value = p.procrastinator_type;
  if (p.works_best) {
    $("#works_best").value = p.works_best;
    const group = $("#works_best_group");
    group
      ?.querySelectorAll("button")
      .forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === p.works_best));
  }
  if (p.has_trouble_finishing) {
    $("#has_trouble_finishing").value = p.has_trouble_finishing;
    const group = $("#has_trouble_finishing_group");
    group
      ?.querySelectorAll("button")
      .forEach((btn) =>
        btn.classList.toggle("selected", btn.dataset.value === p.has_trouble_finishing),
      );
  }
  if (p.preferred_work_style) $("#preferred_work_style").value = p.preferred_work_style;
  if (p.most_productive_time) $("#most_productive_time").value = p.most_productive_time;
  $("#preferred_study_method").value = p.preferred_study_method || "";
  $("#weekly_personal_time").value = p.weekly_personal_time ?? "";
  $("#weekly_review_hours").value = p.weekly_review_hours ?? "";
}

function initTaskForm() {
  const priorityGroup = $("#task_priority_group");
  priorityGroup?.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    const val = e.target.dataset.value;
    $("#task_priority").value = val;
    priorityGroup
      .querySelectorAll("button")
      .forEach((btn) => btn.classList.toggle("selected", btn === e.target));
  });

  const taskForm = $("#taskForm");
  taskForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const task = readTaskFromForm();
    if (!task) return;

    if (editingTaskId) {
      // Update existing task
      const idx = state.tasks.findIndex((t) => t.id === editingTaskId);
      if (idx !== -1) {
        state.tasks[idx] = { ...state.tasks[idx], ...task, id: editingTaskId };
      }
      editingTaskId = null;
      const submitBtn = taskForm.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.textContent = "Add task to list";
    } else {
      // Create new task
      const newTask = {
        ...task,
        id: `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        completed: false,
      };
      state.tasks.push(newTask);
    }

    saveState();
    renderTasks();
    renderTaskSummary();
    taskForm.reset();
    $("#task_priority").value = "";
    priorityGroup?.querySelectorAll("button").forEach((btn) => btn.classList.remove("selected"));
    $("#planTasksBtn").disabled = state.tasks.length === 0;
  });

  $("#planTasksBtn")?.addEventListener("click", () => {
    rankTasks();
    renderRankedPreview();
    setStep(3);
  });
}

function readTaskFromForm() {
  const name = $("#task_name").value.trim();
  const priority = $("#task_priority").value;
  const deadlineDate = $("#task_deadline").value;
  const deadlineTime = $("#task_deadline_time").value || "23:59";
  const durationHours = parseFloat($("#task_duration").value || "0");
  const computer_required = $("#computer_required").checked;
  if (!name || !priority || !deadlineDate || !durationHours) {
    alert("Please fill in task name, priority, deadline, and duration.");
    return null;
  }
  const task = {
    // id will be assigned on create; preserved on edit
    task_name: name,
    task_priority: priority,
    task_deadline: deadlineDate,
    task_deadline_time: deadlineTime,
    task_duration_hours: durationHours,
    computer_required,
  };
  return task;
}

function ensureTaskIds() {
  if (!state.tasks) {
    state.tasks = [];
    return;
  }
  let changed = false;
  state.tasks.forEach((t) => {
    if (!t.id) {
      t.id = `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      changed = true;
    }
    if (typeof t.completed !== "boolean") {
      t.completed = false;
      changed = true;
    }
  });
  if (changed) {
    saveState();
  }
}

function renderTasks() {
  const container = $("#taskList");
  if (!container) return;
  container.innerHTML = "";

  const tasks = [...state.tasks];
  tasks.sort((a, b) => {
    // Incomplete first, then by priority & deadline
    const ca = a.completed ? 1 : 0;
    const cb = b.completed ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const pa = PRIORITY_WEIGHTS[a.task_priority] ?? 99;
    const pb = PRIORITY_WEIGHTS[b.task_priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.task_deadline.localeCompare(b.task_deadline);
  });

  tasks.forEach((task) => {
    const wrapper = document.createElement("div");
    wrapper.className = "task-item" + (task.completed ? " task-completed" : "");
    const priorityKey = (task.task_priority || "").toLowerCase().replace(/[^a-z]+/g, "-");
    wrapper.innerHTML = `
      <div class="task-checkbox">
        <div class="checkbox-fancy${task.completed ? " completed" : ""}" data-id="${task.id}">
          <div class="checkbox-fancy-inner"></div>
        </div>
      </div>
      <div class="task-content">
        <div class="task-title">${task.task_name}</div>
        <div class="task-meta">
          <span class="priority-pill priority-${priorityKey}">${task.task_priority}</span>
          <span class="task-badge">Due ${task.task_deadline} ${task.task_deadline_time}</span>
          <span class="task-badge">${task.task_duration_hours}h</span>
          <button type="button" class="task-edit-btn" data-id="${task.id}">Edit</button>
        </div>
      </div>
    `;
    container.appendChild(wrapper);
  });

  // completion toggle & edit shortcut
  container.onclick = (e) => {
    const editBtn = e.target.closest(".task-edit-btn");
    if (editBtn) {
      const id = editBtn.dataset.id;
      if (id) startEditTask(id);
      e.stopPropagation();
      return;
    }

    const checkbox = e.target.closest(".checkbox-fancy");
    if (checkbox) {
      const id = checkbox.dataset.id;
      const task = state.tasks.find((t) => t.id === id);
      if (task) {
        task.completed = !task.completed;
        saveState();
        // Re-render so completed items move down & get styling
        renderTasks();
        renderTaskSummary();
      }
      return;
    }

    // Click on task content to edit
    const taskEl = e.target.closest(".task-item");
    if (taskEl) {
      const id = taskEl.querySelector(".checkbox-fancy")?.dataset.id;
      if (id) startEditTask(id);
    }
  };
}

function renderTaskSummary() {
  const container = $("#taskSummaryList");
  if (!container) return;
  container.innerHTML = "";
  const tasks = [...state.tasks];
  tasks.sort((a, b) => {
    const ca = a.completed ? 1 : 0;
    const cb = b.completed ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const pa = PRIORITY_WEIGHTS[a.task_priority] ?? 99;
    const pb = PRIORITY_WEIGHTS[b.task_priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.task_deadline.localeCompare(b.task_deadline);
  });
  tasks.forEach((t, idx) => {
    const item = document.createElement("div");
    item.className = "task-summary-item" + (t.completed ? " task-summary-completed" : "");
    const priorityKey = (t.task_priority || "").toLowerCase().replace(/[^a-z]+/g, "-");
    item.innerHTML = `
      <span>${idx + 1}. ${t.task_name}</span>
      <span>
        <button type="button" class="task-edit-btn" data-id="${t.id}">Edit</button>
        <span class="priority-pill priority-${priorityKey}">${t.task_priority}</span>
      </span>
    `;
    container.appendChild(item);
  });
  $("#planTasksBtn").disabled = tasks.length === 0;

  // Delegate edit button clicks
  container.onclick = (e) => {
    const btn = e.target.closest(".task-edit-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    if (id) startEditTask(id);
  };
}

function startEditTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;

  // Fill form fields
  $("#task_name").value = task.task_name;
  $("#task_deadline").value = task.task_deadline;
  $("#task_deadline_time").value = task.task_deadline_time;
  $("#task_duration").value = task.task_duration_hours;
  $("#computer_required").checked = !!task.computer_required;
  $("#task_priority").value = task.task_priority;

  // Highlight priority button
  const priorityGroup = $("#task_priority_group");
  priorityGroup
    ?.querySelectorAll("button")
    .forEach((btn) => btn.classList.toggle("selected", btn.dataset.value === task.task_priority));

  // Change submit button text
  const taskForm = $("#taskForm");
  const submitBtn = taskForm?.querySelector("button[type=submit]");
  if (submitBtn) submitBtn.textContent = "Save changes";

  // Jump to task step
  setStep(2);
}

function rankTasks() {
  const tasks = [...state.tasks];
  tasks.sort((a, b) => {
    const pa = PRIORITY_WEIGHTS[a.task_priority] ?? 99;
    const pb = PRIORITY_WEIGHTS[b.task_priority] ?? 99;
    if (pa !== pb) return pa - pb;
    const da = `${a.task_deadline}T${a.task_deadline_time}`;
    const db = `${b.task_deadline}T${b.task_deadline_time}`;
    return da.localeCompare(db);
  });
  state.rankedTasks = tasks;
  saveState();
}

function renderRankedPreview() {
  const container = $("#rankedTaskPreview");
  if (!container) return;
  container.innerHTML = "";
  if (!state.rankedTasks || state.rankedTasks.length === 0) {
    container.textContent = "No tasks yet. Go back and add some tasks first.";
    return;
  }
  state.rankedTasks.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "ranked-preview-item";
    const priorityKey = (t.task_priority || "").toLowerCase().replace(/[^a-z]+/g, "-");
    row.innerHTML = `
      <span>${idx + 1}. ${t.task_name}</span>
      <span>
        <span class="priority-pill priority-${priorityKey}">${t.task_priority}</span>
        <span class="task-badge">Due ${t.task_deadline}</span>
      </span>
    `;
    container.appendChild(row);
  });
}

function initWizardButtons() {
  $("#backToProfileBtn")?.addEventListener("click", () => setStep(1));
  $("#goToConfirmBtn")?.addEventListener("click", () => {
    rankTasks();
    renderRankedPreview();
    setStep(3);
  });
  $("#editTasksBtn")?.addEventListener("click", () => setStep(2));

  $("#confirmGenerateBtn")?.addEventListener("click", () => {
    if (!state.profile || !state.rankedTasks.length) {
      alert("Please complete your profile and tasks first.");
      return;
    }
    generateSchedule();
    renderSchedule();
    $("#calendarSubtitle").textContent =
      "Your tasks are time‑blocked so everything finishes before the deadline. You can click blocks to adjust or start focus.";
  });
}

// ---------- Scheduling Engine ----------

function generateSchedule() {
  const profile = state.profile;
  const tasks = [...state.rankedTasks];
  const schedule = [];
  const fixedBlocks = [];

  const startDate = new Date(todayLocalISODate() + "T00:00:00");

  // Build availability grid for next 14 days, 30-min slots
  const horizonDays = 14;
  const slotsByDay = [];

  for (let i = 0; i < horizonDays; i++) {
    const dayDate = new Date(startDate.getTime());
    dayDate.setDate(startDate.getDate() + i);
    const dayNameIndex = dayDate.getDay(); // 0=Sun
    const dayName = DAYS[(dayNameIndex + 6) % 7]; // map Mon=0

    const dailySlots = [];
    // 6:00 - 23:30
    for (let minute = 6 * 60; minute < 24 * 60; minute += 30) {
      dailySlots.push({
        startMinutes: minute,
        available: true,
        personal: false,
        reviewPreferred: false,
      });
    }

    // Block fixed weekly schedule for Mon-Fri (now array of {name, time, description})
    if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dayName)) {
      const dayCommitments = profile.weekly_schedule?.[dayName];
      if (dayCommitments) {
        // Handle both old string format and new array format
        if (typeof dayCommitments === "string" && dayCommitments.trim()) {
          // Legacy: single time range string
          applyTimeRangeToSlots(dayCommitments, dailySlots, { available: false });
          createFixedBlocksForDay(dayCommitments, dayDate, "Fixed commitment", "routine", fixedBlocks);
        } else if (Array.isArray(dayCommitments)) {
          // New format: array of commitments
          dayCommitments.forEach((commitment) => {
            if (commitment.time) {
              applyTimeRangeToSlots(commitment.time, dailySlots, { available: false });
              const label = commitment.name || "Fixed commitment";
              createFixedBlocksForDay(commitment.time, dayDate, label, "routine", fixedBlocks);
            }
          });
        }
      }
    }

    // Block simple breaks (applied every day) and visualize them
    if (profile.break_times) {
      applyTimeRangeToSlots(profile.break_times, dailySlots, { available: false });
      createFixedBlocksForDay(profile.break_times, dayDate, "Break", "break", fixedBlocks);
    }

    // Weekend specific fixed activities (now structured format)
    if (["Sat", "Sun"].includes(dayName)) {
      const key = dayName === "Sat" ? "Saturday" : "Sunday";
      const dayActivities = profile.weekend_schedule?.[key];
      
      if (dayActivities) {
        // Handle both old string format (parsed) and new array format
        if (typeof profile.weekend_schedule === "string") {
          // Legacy: parse text format
          const weekendDefinitions = parseWeekendSchedule(profile.weekend_schedule);
          const defs = weekendDefinitions[key] || [];
          defs.forEach((def) => {
            applyTimeRangeToSlots(def.range, dailySlots, { available: false });
            createFixedBlocksForDay(def.range, dayDate, def.label || "Weekend activity", "weekend", fixedBlocks);
          });
        } else if (Array.isArray(dayActivities)) {
          // New format: array of {name, time, description}
          dayActivities.forEach((activity) => {
            if (activity.time) {
              applyTimeRangeToSlots(activity.time, dailySlots, { available: false });
              const label = activity.name || "Weekend activity";
              createFixedBlocksForDay(activity.time, dayDate, label, "weekend", fixedBlocks);
            }
          });
        }
      }
    }

    // Allocate weekly personal time as last N hours of week (rough heuristic)
    if (profile.weekly_personal_time > 0) {
      const totalPersonalMinutes = profile.weekly_personal_time * 60;
      const minutesPerDay = Math.floor(totalPersonalMinutes / 7);
      if (minutesPerDay > 0) {
        let minutesAssigned = 0;
        for (let idx = dailySlots.length - 1; idx >= 0 && minutesAssigned < minutesPerDay; idx--) {
          const slot = dailySlots[idx];
          slot.available = false;
          slot.personal = true;
          minutesAssigned += 30;
        }
      }
    }

    // Mark review-preferred slots if weekly_review_hours > 0 (morning sessions)
    if (profile.weekly_review_hours > 0) {
      for (const slot of dailySlots) {
        if (slot.startMinutes >= 8 * 60 && slot.startMinutes <= 11 * 60) {
          slot.reviewPreferred = true;
        }
      }
    }

    slotsByDay.push({
      date: dayDate,
      dayName,
      slots: dailySlots,
    });
  }

  // Schedule tasks
  tasks.forEach((task) => {
    const totalMinutes = Math.ceil(task.task_duration_hours * 60);
    const chunkCount = Math.max(1, Math.ceil(totalMinutes / 30));
    const deadline = new Date(`${task.task_deadline}T${task.task_deadline_time}:00`);

    // Avoid scheduling right at the final minute: require completion before deadline
    const latestAllowed = addMinutes(deadline, -30);

     // Determine usable day range within horizon
     let startDayIndex = 0;
     let endDayIndex = slotsByDay.length - 1;
     for (let i = 0; i < slotsByDay.length; i++) {
       const day = slotsByDay[i].date;
       const dayStart = new Date(day.getTime());
       dayStart.setHours(0, 0, 0, 0);
       const dayEnd = new Date(day.getTime());
       dayEnd.setHours(23, 59, 0, 0);
       if (dayEnd < startDate) continue;
       startDayIndex = i;
       break;
     }
     for (let i = 0; i < slotsByDay.length; i++) {
       const day = slotsByDay[i].date;
       const dayEnd = new Date(day.getTime());
       dayEnd.setHours(23, 59, 0, 0);
       if (dayEnd <= latestAllowed) endDayIndex = i;
     }

     if (endDayIndex < startDayIndex) {
       // No days available before deadline; skip to avoid post-deadline scheduling
       return;
     }

     const daysAvailable = Math.max(1, endDayIndex - startDayIndex + 1);
     // Spread work: cap how many chunks we place per day for this task
     const maxChunksPerDay = Math.max(1, Math.ceil(chunkCount / daysAvailable));

    let chunksScheduled = 0;
    let dayIndex = startDayIndex;

    while (chunksScheduled < chunkCount && dayIndex <= endDayIndex) {
      const dayInfo = slotsByDay[dayIndex];
      const { date, slots } = dayInfo;

      let chunksToday = 0;

      const isWeekend = ["Sat", "Sun"].includes(dayInfo.dayName);

      // Select candidate slots emphasizing productive time for more demanding tasks
      const productiveRange = PRODUCTIVE_TIME_WINDOWS[profile.most_productive_time] || [9, 17];
      const [prodStart, prodEnd] = productiveRange.map((h) => h * 60);

      for (const slot of slots) {
        if (!slot.available) continue;
        if (chunksToday >= maxChunksPerDay) break;

        const slotDateTime = new Date(
          `${date.toISOString().slice(0, 10)}T${formatMinutesToTime(slot.startMinutes)}:00`,
        );
        if (slotDateTime > latestAllowed) continue;

        // For important & urgent tasks, strongly favor productive range
        const priorityWeight = PRIORITY_WEIGHTS[task.task_priority] ?? 4;
        const insideProductiveWindow =
          slot.startMinutes >= prodStart && slot.startMinutes < prodEnd;

        if (priorityWeight <= 2 && !insideProductiveWindow) {
          // Skip non-productive time early; will backfill later if needed
          continue;
        }

        // Assign chunk
        const start = new Date(slotDateTime);
        const end = addMinutes(start, 30);
        schedule.push({
          kind: "task",
          taskId: task.id,
          taskName: task.task_name,
          priority: task.task_priority,
          start: start.toISOString(),
          end: end.toISOString(),
          isWeekend,
        });
        slot.available = false;
        chunksScheduled++;
        chunksToday++;
        if (chunksScheduled >= chunkCount) break;
      }

      dayIndex++;
    }

    if (chunksScheduled < chunkCount) {
      console.warn(
        `Could not fully schedule task "${task.task_name}" before deadline without procrastination.`,
      );
    }
  });

  state.schedule = schedule;
  state.fixedBlocks = fixedBlocks;
  saveState();
}

function applyTimeRangeToSlots(definition, slots, overrides) {
  // definition can be "HH:MM-HH:MM; HH:MM-HH:MM" etc.
  if (!definition) return;
  const parts = definition.split(/[;,]+/);
  parts.forEach((part) => {
    const trimmed = part.trim();
    const m = trimmed.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) return;
    const startMin = parseTimeToMinutes(m[1]);
    const endMin = parseTimeToMinutes(m[2]);
    if (startMin == null || endMin == null) return;
    slots.forEach((slot) => {
      if (slot.startMinutes >= startMin && slot.startMinutes < endMin) {
        Object.assign(slot, overrides);
      }
    });
  });
}

// Create 30-minute fixed blocks for visualization in the calendar
function createFixedBlocksForDay(definition, date, label, category, fixedBlocks) {
  if (!definition) return;
  const parts = definition.split(/[;,]+/);
  parts.forEach((part) => {
    const trimmed = part.trim();
    const m = trimmed.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) return;
    const startMin = parseTimeToMinutes(m[1]);
    const endMin = parseTimeToMinutes(m[2]);
    if (startMin == null || endMin == null) return;
    for (let minute = startMin; minute < endMin; minute += 30) {
      const startTimeStr = formatMinutesToTime(minute);
      const start = new Date(`${date.toISOString().slice(0, 10)}T${startTimeStr}:00`);
      const end = addMinutes(start, 30);
      fixedBlocks.push({
        kind: "fixed",
        label,
        category,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  });
}

// Parse weekend_schedule text into structured definitions:
// Example line: "Saturday 10:00-12:00 soccer" or "Sun 09:00-11:00 family"
function parseWeekendSchedule(text) {
  const result = {
    Saturday: [],
    Sunday: [],
  };
  if (!text) return result;

  const lines = text.split(/\n|;/);
  const dayPatterns = {
    Saturday: /^(saturday|sat)\b/i,
    Sunday: /^(sunday|sun)\b/i,
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    let matchedDay = null;
    let withoutDay = line;

    Object.entries(dayPatterns).forEach(([dayName, regex]) => {
      if (!matchedDay && regex.test(line)) {
        matchedDay = dayName;
        withoutDay = line.replace(regex, "").trim();
      }
    });

    if (!matchedDay) return;

    const timeMatch = withoutDay.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) return;

    const label = withoutDay.replace(timeMatch[0], "").trim();
    result[matchedDay].push({
      range: `${timeMatch[1]}-${timeMatch[2]}`,
      label,
    });
  });

  return result;
}

// ---------- Calendar Rendering ----------

let currentCalendarView = "weekly";

function initCalendarViewToggle() {
  $all(".btn-toggle-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      currentCalendarView = view;
      $all(".btn-toggle-view").forEach((b) =>
        b.classList.toggle("active", b.dataset.view === view),
      );
      renderSchedule();
    });
  });
}

function renderSchedule() {
  const container = $("#calendarContainer");
  if (!container) return;

  if ((!state.schedule || state.schedule.length === 0) &&
      (!state.fixedBlocks || state.fixedBlocks.length === 0)) {
    container.innerHTML = `
      <div class="calendar-inner">
        <div class="calendar-empty-state">
          <span>🌱</span>
          <div>Your smart schedule will appear here after you click <strong>Yes ✅</strong> in Step 3.</div>
        </div>
      </div>
    `;
    return;
  }

  if (currentCalendarView === "monthly") {
    renderMonthlyView(container);
  } else {
    renderTimeGridView(container, currentCalendarView);
  }
}

function renderTimeGridView(container, view) {
  const schedule = [...(state.schedule || [])];
  const fixed = [...(state.fixedBlocks || [])];
  const allBlocks = [...fixed, ...schedule].sort((a, b) => a.start.localeCompare(b.start));

  const inner = document.createElement("div");
  inner.className = "calendar-inner";

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  // Header row
  const headerRow = document.createElement("div");
  headerRow.className = "calendar-header-row";

  const emptyHeader = document.createElement("div");
  emptyHeader.className = "calendar-header-cell";
  emptyHeader.textContent = "";
  headerRow.appendChild(emptyHeader);

  const startDate = new Date(allBlocks[0].start);
  const base = new Date(startDate.toISOString().slice(0, 10) + "T00:00:00");

  const daysToRender = view === "daily" ? 1 : 7;
  const dayDates = [];
  for (let i = 0; i < daysToRender; i++) {
    const d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    dayDates.push(d);
    const cell = document.createElement("div");
    cell.className = "calendar-header-cell";
    const dayName = DAYS[(d.getDay() + 6) % 7];
    cell.textContent = `${dayName} ${d.getDate()}`;
    headerRow.appendChild(cell);
  }

  grid.appendChild(headerRow);

  const startHour = 6;
  const endHour = 24;

  for (let hour = startHour; hour < endHour; hour++) {
    for (let half = 0; half < 2; half++) {
      const minutesOfDay = hour * 60 + half * 30;
      const timeCell = document.createElement("div");
      timeCell.className = "calendar-time-cell";
      timeCell.textContent =
        half === 0 ? `${String(hour).padStart(2, "0")}:00` : "";
      grid.appendChild(timeCell);

      for (let dayIdx = 0; dayIdx < daysToRender; dayIdx++) {
        const slotCell = document.createElement("div");
        slotCell.className = "calendar-slot-cell";

        const dayDate = dayDates[dayIdx].toISOString().slice(0, 10);
        const timeStr = formatMinutesToTime(minutesOfDay);
        const slotStartISO = `${dayDate}T${timeStr}:00`;

        // All blocks (tasks or fixed) that start at this time
        const blocksHere = allBlocks.filter((s) => s.start.startsWith(slotStartISO));
        if (blocksHere.length) {
          // Prefer showing task block over fixed if both exist
          const block =
            blocksHere.find((b) => b.kind === "task") ||
            blocksHere[0];

          let blockDiv = document.createElement("div");

          if (block.kind === "fixed") {
            blockDiv.className = "calendar-task-block calendar-task-block-fixed";
            blockDiv.innerHTML = `
              <div class="calendar-task-title">${block.label}</div>
              <div class="calendar-task-meta">${timeStr} · routine</div>
            `;
          } else {
            const task = state.tasks.find((t) => t.id === block.taskId);
            const priority = task?.task_priority || block.priority;
            const priorityKey = (priority || "").toLowerCase().replace(/[^a-z]+/g, "-");

            blockDiv.className = "calendar-task-block priority-" + priorityKey;
            blockDiv.dataset.taskId = block.taskId;
            blockDiv.innerHTML = `
              <div class="calendar-task-title">${block.taskName}</div>
              <div class="calendar-task-meta">${timeStr} · 30m</div>
            `;
          }

          blockDiv.addEventListener("click", () => onCalendarBlockClick(block));
          slotCell.appendChild(blockDiv);
        }

        grid.appendChild(slotCell);
      }
    }
  }

  inner.appendChild(grid);
  container.innerHTML = "";
  container.appendChild(inner);
}

function renderMonthlyView(container) {
  const schedule = [
    ...(state.fixedBlocks || []),
    ...(state.schedule || []),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const inner = document.createElement("div");
  inner.className = "calendar-inner";

  const header = document.createElement("div");
  header.className = "calendar-header-row";
  const empty = document.createElement("div");
  empty.className = "calendar-header-cell";
  empty.textContent = "";
  header.appendChild(empty);
  DAYS.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "calendar-header-cell";
    cell.textContent = day;
    header.appendChild(cell);
  });

  inner.appendChild(header);

  const monthGrid = document.createElement("div");
  monthGrid.className = "calendar-month-grid";

  const first = new Date(schedule[0].start);
  const year = first.getFullYear();
  const month = first.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startIndex = (firstOfMonth.getDay() + 6) % 7; // Monday-first index

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startIndex + daysInMonth) / 7) * 7;

  const scheduleByDate = schedule.reduce((acc, s) => {
    const day = s.start.slice(0, 10);
    acc[day] = acc[day] || [];
    acc[day].push(s);
    return acc;
  }, {});

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "calendar-month-cell";

    const dayNumber = i - startIndex + 1;
    if (dayNumber > 0 && dayNumber <= daysInMonth) {
      const dateStr = new Date(year, month, dayNumber).toISOString().slice(0, 10);
      const dayLabel = document.createElement("div");
      dayLabel.className = "calendar-month-day";
      dayLabel.textContent = dayNumber;
      cell.appendChild(dayLabel);

      if (scheduleByDate[dateStr]?.length) {
        const dot = document.createElement("div");
        dot.className = "calendar-month-dot";
        cell.appendChild(dot);
      }
    }

    monthGrid.appendChild(cell);
  }

  inner.appendChild(monthGrid);
  container.innerHTML = "";
  container.appendChild(inner);
}

// ---------- Calendar Interactions ----------

let countdownInterval = null;

function onCalendarBlockClick(block) {
  const profile = state.profile;
  if (block.kind === "fixed") {
    alert(
      `Routine: ${block.label}\nTime: ${block.start.slice(11, 16)} - ${block.end.slice(
        11,
        16,
      )}`,
    );
    return;
  }

  if (!block.taskId) return;

  // If user is a procrastinator who works best under pressure, open Pomodoro-style countdown
  if (profile?.is_procrastinator === "yes" && profile.works_best === "Under Pressure") {
    startCountdown(block);
    return;
  }

  // Otherwise, show quick info and jump to editable task
  const task = state.tasks.find((t) => t.id === block.taskId);
  alert(
    `Task: ${block.taskName}\nTime: ${block.start.slice(11, 16)} - ${block.end.slice(
      11,
      16,
    )}\nPriority: ${task?.task_priority ?? "N/A"}`,
  );
  startEditTask(block.taskId);
}

function startCountdown(block) {
  const overlay = $("#countdownOverlay");
  const nameEl = $("#countdownTaskName");
  const timerEl = $("#countdownTimer");
  const stopBtn = $("#stopCountdownBtn");

  nameEl.textContent = `Stay with: ${block.taskName}`;
  let remaining = 25 * 60; // 25 minutes

  function render() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  render();
  overlay.classList.remove("hidden");

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      overlay.classList.add("hidden");
      alert("Nice work. This focus block is done — take a short break. 🌟");
      return;
    }
    render();
  }, 1000);

  stopBtn.onclick = () => {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
    overlay.classList.add("hidden");
  };
}

// ---------- Chatbot ----------

function initChatbot() {
  const chatWindow = $("#chatWindow");
  const chatForm = $("#chatForm");
  const chatInput = $("#chatInput");
  if (!chatWindow || !chatForm || !chatInput) return;

  function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.className = `chat-message ${sender}`;
    msg.innerHTML = text;
    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function initialMessage() {
    addMessage(
      "Hi! I’m your PlanWise assistant. Tell me how you’re feeling about your workload or ask for help with prioritizing, focus, or breaks.",
      "bot",
    );
  }

  if (!chatWindow.dataset.initialized) {
    chatWindow.dataset.initialized = "true";
    initialMessage();
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    addMessage(text, "user");
    chatInput.value = "";

    generateChatReply(text)
      .then((reply) => addMessage(reply, "bot"))
      .catch((err) => {
        console.warn("Falling back to local reply:", err);
        addMessage(fallbackRuleBasedReply(text), "bot");
      });
  });
}

async function generateChatReply(text) {
  const name = state.profile?.user_name || "friend";

  // Try backend /api/chat first
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: text,
        context: `User: ${name}. Current schedule has ${state.tasks?.length || 0} tasks.`,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    const data = await res.json();
    if (data && typeof data.reply === "string") {
      return data.reply;
    }
    throw new Error("No reply field in API response");
  } catch (err) {
    console.warn("Chat API failed, using local rule-based answers instead.", err);
    return fallbackRuleBasedReply(text);
  }
}

function fallbackRuleBasedReply(text) {
  const lower = text.toLowerCase();
  const name = state.profile?.user_name || "friend";

  if (lower.includes("overwhelmed") || lower.includes("too much")) {
    return `I hear you, ${name}. Let’s tackle this gently: start with the most urgent & important task and aim for one 25‑minute focus block. After that, take a 5‑minute break and reassess — you don’t have to finish everything at once.`;
  }
  if (lower.includes("procrastinate") || lower.includes("motivation")) {
    return `Procrastination usually shows up when a task feels vague or huge. Try rewriting one task as a very concrete 30‑minute action (like “outline intro paragraph” instead of “write essay”), then start the smallest, easiest part. I’ll keep scheduling sessions so future‑you isn’t stressed right before deadlines.`;
  }
  if (lower.includes("break") || lower.includes("rest")) {
    return `Smart breaks keep your brain sharp. After about 25–50 minutes of focused work, step away for 5–10 minutes — move, hydrate, or look away from screens — then come back for another block. I’ll help you preserve your weekly personal time so rest is protected, not optional.`;
  }
  if (lower.includes("focus") || lower.includes("distract")) {
    return `To protect your focus, choose one task block from the calendar and commit to it only for the next 25 minutes. Silence notifications, clear your desk, and keep just what you need for that task visible. If you’re a “works under pressure” type, we can use the countdown timer to recreate that urgency early, not at the last minute.`;
  }
  if (lower.includes("schedule") || lower.includes("plan")) {
    return `Your schedule is built around deadlines, priorities, and your productive times. If something feels off, you can tell me which task is stressing you most, and I’ll suggest which block to move or split so your plan feels more humane and still finishes before the deadline.`;
  }

  return `Good question, ${name}. In general: keep your highest‑priority tasks in your most productive time of day, use 30‑minute chunks so nothing feels impossible, and avoid stacking all the hard work right before deadlines. If you tell me which task feels most important today, I can help you choose the best starting point.`;
}

// ---------- Restore ----------

function restoreFromState() {
  if (state.profile) {
    restoreProfileToForm();
  }
  if (state.tasks?.length) {
    renderTasks();
    renderTaskSummary();
  }
  if (state.rankedTasks?.length) {
    renderRankedPreview();
  }
  renderSchedule();
  if (state.profile) {
    setStep(2);
  } else {
    setStep(1);
  }
}


