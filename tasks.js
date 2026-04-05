// tasks.js — Task list rendering and state management (Supabase backend)

// --- Render a single task item ---

function renderTaskItem(item, cat, section, moveTarget) {
  const doneClass = item.done ? 'task-done' : '';

  let urgentClass = '';
  if (item.deadline) {
    const dl = new Date(item.deadline + 'T12:00:00');
    const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 3) urgentClass = 'task-item-urgent';
  }

  let textHtml;
  if (item.link) {
    textHtml = `<span class="task-text" data-editable="true" data-id="${item.id}"><a href="${item.link}" target="_blank" class="task-link">${escapeHtml(item.text)}</a></span>`;
  } else {
    textHtml = `<span class="task-text" data-editable="true" data-id="${item.id}">${escapeHtml(item.text)}</span>`;
  }

  let deadlineHtml = '';
  if (item.deadline) {
    const dl = new Date(item.deadline + 'T12:00:00');
    const daysUntil = Math.ceil((dl - new Date()) / (1000 * 60 * 60 * 24));
    const dlLabel = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (daysUntil <= 3) deadlineHtml = `<span class="deadline-urgent">due ${dlLabel}</span>`;
    else if (daysUntil <= 7) deadlineHtml = `<span class="deadline-soon">due ${dlLabel}</span>`;
    else deadlineHtml = `<span class="deadline-later">due ${dlLabel}</span>`;
  }

  const moveLabel = moveTarget === 'now' ? '\u2191' : '\u2193';
  const moveTitle = moveTarget === 'now' ? 'Move to Agenda' : 'Move to Backlog';
  const moveBtn = `<button class="move-btn" data-id="${item.id}" data-move-to="${moveTarget}" title="${moveTitle}">${moveLabel}</button>`;

  const allSubs = item.subtasks || [];
  const hasSubtasks = allSubs.length > 0;

  if (hasSubtasks) {
    const subItems = allSubs.map((sub, si) => {
      const subChecked = sub.done;
      return `<div class="task-item subtask ${subChecked ? 'task-done' : ''}">
        <input type="checkbox" class="task-checkbox subtask-checkbox" data-id="${item.id}" data-sub-index="${si}" ${subChecked ? 'checked' : ''}>
        <span class="task-text subtask-text" data-editable="true" data-id="${item.id}" data-sub-index="${si}">${escapeHtml(sub.text)}</span>
        <button class="delete-sub-btn" data-id="${item.id}" data-sub-index="${si}" title="Remove">&times;</button>
      </div>`;
    }).join('');

    const subtasksHtml = `<div class="subtask-list subtask-collapsed" data-id="${item.id}">
      ${subItems}
      <div class="add-subtask-row">
        <span class="add-subtask-trigger" data-id="${item.id}">+ subtask</span>
        <input type="text" class="add-subtask-input add-subtask-hidden" data-id="${item.id}" placeholder="Add subtask and press Enter...">
      </div>
    </div>`;

    const toggleBtn = `<button class="subtask-toggle-btn" data-id="${item.id}" title="Show subtasks">${allSubs.length}</button>`;
    return `<div class="task-item ${doneClass} ${urgentClass}" data-id="${item.id}">
      <input type="checkbox" class="task-checkbox parent-checkbox" data-id="${item.id}" ${item.done ? 'checked' : ''}>
      ${textHtml}${deadlineHtml}${toggleBtn}${moveBtn}
    </div>${subtasksHtml}`;
  }

  return `<div class="task-item ${doneClass} ${urgentClass}" data-id="${item.id}">
    <input type="checkbox" class="task-checkbox parent-checkbox" data-id="${item.id}" ${item.done ? 'checked' : ''}>
    ${textHtml}${deadlineHtml}${moveBtn}
  </div>`;
}

// --- Helper: find task object inside appData.tasks by id ---

function findTaskById(tasks, id) {
  for (const cat of CATEGORY_ORDER) {
    const group = tasks[cat];
    if (!group) continue;
    for (const list of ['now', 'backlog']) {
      const found = (group[list] || []).find(t => t.id === id);
      if (found) return { task: found, category: cat, list };
    }
  }
  return null;
}

// --- Backlog rendering ---

function renderBacklog(tasks) {
  const container = document.getElementById('taskList');
  if (!tasks) { container.innerHTML = '<p class="empty-state">No tasks loaded.</p>'; return; }

  // Collapse state stays in localStorage (UI-only)
  const collapseState = {};
  CATEGORY_ORDER.forEach(cat => {
    const stored = localStorage.getItem('task-collapse-' + cat);
    collapseState[cat] = stored === null ? true : stored === 'true';
  });

  container.innerHTML = CATEGORY_ORDER.map(cat => {
    const group = tasks[cat];
    if (!group) return '';
    const backlogItems = group.backlog || [];
    if (backlogItems.length === 0) return '';

    const tagClass = categoryTagClass(cat);
    const isCollapsed = collapseState[cat];
    const backlogHtml = backlogItems.map(item => renderTaskItem(item, cat, 'backlog', 'now')).join('');

    return `<div class="task-group ${isCollapsed ? 'collapsed' : ''}" data-cat="${cat}">
      <div class="task-group-header" data-cat="${cat}">
        <span class="task-group-arrow">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="category-tag ${tagClass} task-cat-title">${cat}</span>
        <span class="task-count">${backlogItems.length}</span>
      </div>
      <div class="task-group-items" data-cat="${cat}">
        ${backlogHtml}
        <div class="add-task-row" data-cat="${cat}">
          <span class="add-task-trigger" data-cat="${cat}">+ add task</span>
          <input type="text" class="add-task-input" data-cat="${cat}" placeholder="New task... press Enter" style="display:none;">
        </div>
      </div>
    </div>`;
  }).join('');

  // --- Completed Projects section ---
  const completedContainer = document.getElementById('completedProjects');
  if (completedContainer) {
    const completedByCategory = {};
    let totalCompleted = 0;
    for (const cat of CATEGORY_ORDER) {
      const group = tasks[cat];
      if (!group) continue;
      const doneItems = (group.now || []).filter(t => t.done);
      if (doneItems.length > 0) {
        completedByCategory[cat] = doneItems;
        totalCompleted += doneItems.length;
      }
    }

    if (totalCompleted > 0) {
      const isExpanded = localStorage.getItem('completed-projects-expanded') === 'true';
      let cpHtml = `<div class="completed-projects-wrapper${isExpanded ? '' : ' cp-collapsed'}">
        <div class="completed-projects-header">
          <span class="completed-projects-arrow">${isExpanded ? '&#9662;' : '&#9656;'}</span>
          <span class="completed-projects-title">Completed Projects</span>
          <span class="task-count">${totalCompleted}</span>
          <button class="completed-projects-clear" title="Clear all completed projects">Clear completed</button>
        </div>
        <div class="completed-projects-items">`;
      for (const cat of CATEGORY_ORDER) {
        if (!completedByCategory[cat]) continue;
        const tagClass = categoryTagClass(cat);
        for (const item of completedByCategory[cat]) {
          cpHtml += `<div class="completed-project-item">
            <span class="cp-check">&#10003;</span>
            <span class="category-tag ${tagClass} cp-cat-badge">${cat}</span>
            <span class="cp-text">${escapeHtml(item.text)}</span>
          </div>`;
        }
      }
      cpHtml += `</div></div>`;
      completedContainer.innerHTML = cpHtml;

      // Collapse/expand toggle
      const header = completedContainer.querySelector('.completed-projects-header');
      if (header) {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.completed-projects-clear')) return;
          const wrapper = completedContainer.querySelector('.completed-projects-wrapper');
          wrapper.classList.toggle('cp-collapsed');
          const collapsed = wrapper.classList.contains('cp-collapsed');
          header.querySelector('.completed-projects-arrow').innerHTML = collapsed ? '&#9656;' : '&#9662;';
          localStorage.setItem('completed-projects-expanded', !collapsed);
        });
      }

      // Clear completed button
      const clearBtn = completedContainer.querySelector('.completed-projects-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Remove all completed projects from the agenda?')) return;
          for (const cat of CATEGORY_ORDER) {
            const group = tasks[cat];
            if (!group) continue;
            const doneItems = (group.now || []).filter(t => t.done);
            for (const item of doneItems) {
              const idx = group.now.findIndex(t => t.id === item.id);
              if (idx >= 0) group.now.splice(idx, 1);
              db.deleteTask(item.id);
            }
          }
          renderBacklog(tasks);
          if (typeof renderProjectsAgenda === 'function') renderProjectsAgenda(tasks);
          if (typeof renderKPIStrip === 'function') renderKPIStrip(appData);
        });
      }
    } else {
      completedContainer.innerHTML = '';
    }
  }

  // --- Event listeners ---

  // Collapse toggle (UI-only, stays in localStorage)
  container.querySelectorAll('.task-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.task-group');
      const cat = group.dataset.cat;
      group.classList.toggle('collapsed');
      const collapsed = group.classList.contains('collapsed');
      header.querySelector('.task-group-arrow').innerHTML = collapsed ? '&#9656;' : '&#9662;';
      localStorage.setItem('task-collapse-' + cat, collapsed);
    });
  });

  // Parent task checkboxes
  container.querySelectorAll('.parent-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      const result = findTaskById(tasks, id);
      if (!result) return;
      const checked = cb.checked;
      // Optimistic UI
      result.task.done = checked;
      cb.closest('.task-item').classList.toggle('task-done', checked);
      // Persist
      await db.updateTask(id, { done: checked });
    });
  });

  // Subtask checkboxes
  container.querySelectorAll('.subtask-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      const subIndex = parseInt(cb.dataset.subIndex);
      const result = findTaskById(tasks, id);
      if (!result) return;
      const checked = cb.checked;
      // Optimistic UI
      result.task.subtasks[subIndex].done = checked;
      cb.closest('.task-item').classList.toggle('task-done', checked);
      // Persist the whole subtasks array
      await db.updateTask(id, { subtasks: result.task.subtasks });
    });
  });

  // Move buttons (backlog -> now)
  container.querySelectorAll('.move-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const target = btn.dataset.moveTo;
      const result = findTaskById(tasks, id);
      if (!result) return;
      // Optimistic UI: move in appData
      const group = tasks[result.category];
      const fromList = group[result.list];
      const idx = fromList.findIndex(t => t.id === id);
      if (idx >= 0) {
        const [item] = fromList.splice(idx, 1);
        group[target].push(item);
      }
      // Re-render affected views
      renderBacklog(tasks);
      if (typeof renderProjectsAgenda === 'function') renderProjectsAgenda(tasks);
      if (typeof renderWeeklyObjectives === 'function') renderWeeklyObjectives(tasks);
      // Persist
      await db.updateTask(id, { list: target });
    });
  });

  // Double-click to edit task text
  container.querySelectorAll('.task-text[data-editable]:not(.subtask-text)').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const id = span.dataset.id;
      const result = findTaskById(tasks, id);
      if (!result) return;
      const current = result.task.text;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'task-text';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.id = id;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          result.task.text = newVal;
          await db.updateTask(id, { text: newVal });
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Double-click to edit subtask text
  container.querySelectorAll('.subtask-text[data-editable]').forEach(span => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const id = span.dataset.id;
      const subIndex = parseInt(span.dataset.subIndex);
      const result = findTaskById(tasks, id);
      if (!result) return;
      const current = result.task.subtasks[subIndex].text;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'task-edit-input';
      span.replaceWith(input);
      input.focus();
      input.select();
      const save = async () => {
        const newVal = input.value.trim();
        const newSpan = document.createElement('span');
        newSpan.className = 'task-text subtask-text';
        newSpan.dataset.editable = 'true';
        newSpan.dataset.id = id;
        newSpan.dataset.subIndex = subIndex;
        newSpan.textContent = newVal || current;
        input.replaceWith(newSpan);
        if (newVal && newVal !== current) {
          result.task.subtasks[subIndex].text = newVal;
          await db.updateTask(id, { subtasks: result.task.subtasks });
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });

  // Subtask toggle (expand/collapse)
  container.querySelectorAll('.subtask-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const list = container.querySelector(`.subtask-list[data-id="${id}"]`);
      if (list) list.classList.toggle('subtask-collapsed');
    });
  });

  // Add subtask trigger
  container.querySelectorAll('.add-subtask-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const row = trigger.closest('.add-subtask-row');
      const input = row.querySelector('.add-subtask-input');
      trigger.style.display = 'none';
      input.classList.remove('add-subtask-hidden');
      input.focus();
    });
  });

  // Add subtask input
  container.querySelectorAll('.add-subtask-input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const id = input.dataset.id;
        const result = findTaskById(tasks, id);
        if (!result) return;
        const newSub = { text: input.value.trim(), done: false, thisWeek: false, today: false };
        // Optimistic UI
        result.task.subtasks.push(newSub);
        // Re-render and persist
        renderBacklog(tasks);
        await db.updateTask(id, { subtasks: result.task.subtasks });
      }
      if (e.key === 'Escape') {
        input.classList.add('add-subtask-hidden');
        input.closest('.add-subtask-row').querySelector('.add-subtask-trigger').style.display = '';
      }
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.classList.add('add-subtask-hidden');
        const trigger = input.closest('.add-subtask-row').querySelector('.add-subtask-trigger');
        if (trigger) trigger.style.display = '';
      }
    });
  });

  // Delete subtask
  container.querySelectorAll('.delete-sub-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const subIndex = parseInt(btn.dataset.subIndex);
      const result = findTaskById(tasks, id);
      if (!result) return;
      // Optimistic UI
      result.task.subtasks.splice(subIndex, 1);
      renderBacklog(tasks);
      // Persist
      await db.updateTask(id, { subtasks: result.task.subtasks });
    });
  });

  // Add task trigger
  container.querySelectorAll('.add-task-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      trigger.style.display = 'none';
      const input = trigger.closest('.add-task-row').querySelector('.add-task-input');
      input.style.display = 'block';
      input.focus();
    });
  });

  // Add task input
  container.querySelectorAll('.add-task-input').forEach(input => {
    const cat = input.dataset.cat;
    const save = async () => {
      const text = input.value.trim();
      if (text) {
        // Insert into Supabase (returns row with id)
        const newRow = await db.insertTask({ text, category: cat, list: 'backlog', subtasks: [] });
        // Optimistic UI: add to appData with the returned id
        const newTask = {
          id: newRow.id,
          text,
          done: false,
          deadline: null,
          link: null,
          thisWeek: false,
          today: false,
          subtasks: [],
        };
        if (!tasks[cat]) tasks[cat] = { description: '', now: [], backlog: [], recurring: [] };
        tasks[cat].backlog.push(newTask);
        renderBacklog(tasks);
      } else {
        input.style.display = 'none';
        const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger');
        if (trigger) trigger.style.display = '';
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { input.value = ''; input.style.display = 'none'; const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger'); if (trigger) trigger.style.display = ''; }
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) { input.style.display = 'none'; const trigger = input.closest('.add-task-row').querySelector('.add-task-trigger'); if (trigger) trigger.style.display = ''; } });
  });
}
