// notes.js — Notes tab: quick capture, tags, pin/archive, checklist

let _notesLoaded = false;
let _notesData = [];
let _activeNoteId = null;
let _activeTagFilter = null;
let _viewMode = 'active'; // 'active' | 'archived'
let _undoTimer = null;

// ─── Init ───

async function initNotes() {
  if (!_notesLoaded) {
    try {
      _notesData = await db.loadNotes();
    } catch (e) {
      console.error('Failed to load notes:', e);
      _notesData = [];
    }
    _notesLoaded = true;
  }

  renderNotesTagBar();
  renderNotesList();
  wireNotesControls();
}

function wireNotesControls() {
  // New Note button
  const newBtn = document.getElementById('notesNewBtn');
  if (newBtn && !newBtn._bound) {
    newBtn._bound = true;
    newBtn.addEventListener('click', () => createNewNote(''));
  }

  // Quick capture
  const quickInput = document.getElementById('notesQuickInput');
  const quickBtn = document.getElementById('notesQuickBtn');
  if (quickInput && !quickInput._bound) {
    quickInput._bound = true;
    const doCapture = async () => {
      const text = quickInput.value.trim();
      if (!text) return;
      quickInput.value = '';
      await createNewNote(text, false); // don't open editor
    };
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doCapture(); }
    });
    quickInput.addEventListener('input', () => {
      if (quickInput.value.includes('\n')) {
        quickInput.value = quickInput.value.replace(/\n/g, '');
        doCapture();
      }
    });
    if (quickBtn) quickBtn.addEventListener('click', doCapture);
  }

  // View toggle (active / archived)
  const toggleContainer = document.getElementById('notesViewToggle');
  if (toggleContainer && !toggleContainer._bound) {
    toggleContainer._bound = true;
    toggleContainer.querySelectorAll('.notes-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _viewMode = btn.dataset.view;
        toggleContainer.querySelectorAll('.notes-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeNoteId = null;
        renderNotesList();
      });
    });
  }
}

// ─── Helpers ───

function detectFormat(content) {
  if (!content || !content.trim()) return 'freeform';
  const lines = content.split('\n').filter(l => l.trim());
  const checklistLines = lines.filter(l => /^\[[ x]\] /.test(l));
  if (checklistLines.length > 0 && checklistLines.length >= lines.length * 0.5) return 'checklist';
  return 'freeform';
}

function parseChecklist(content) {
  if (!content) return [{ text: '', done: false }];
  const items = content.split('\n').map(line => {
    const match = line.match(/^\[([ x])\] (.*)$/);
    if (match) return { done: match[1] === 'x', text: match[2] };
    if (line.trim()) return { done: false, text: line.trim() };
    return null;
  }).filter(Boolean);
  return items.length ? items : [{ text: '', done: false }];
}

function serializeChecklist(items) {
  return items.map(i => `[${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
}

function convertToChecklist(content) {
  if (!content || !content.trim()) return '[ ] ';
  return content.split('\n').filter(l => l.trim()).map(line => {
    if (/^\[[ x]\] /.test(line)) return line;
    return `[ ] ${line.trim()}`;
  }).join('\n');
}

function convertToFreeform(content) {
  if (!content) return '';
  return content.split('\n').map(line => {
    const match = line.match(/^\[[ x]\] (.*)$/);
    return match ? match[1] : line;
  }).join('\n');
}

function getAllTags() {
  const tagSet = new Set();
  for (const n of _notesData) {
    if (n.tags) n.tags.forEach(t => tagSet.add(t));
  }
  return Array.from(tagSet).sort();
}

function isArchived(note) {
  return !!note.archived_at;
}

// ─── Tag Bar ───

function renderNotesTagBar() {
  const bar = document.getElementById('notesTagBar');
  if (!bar) return;
  const tags = getAllTags();
  if (tags.length === 0) { bar.innerHTML = ''; return; }

  bar.innerHTML = tags.map(t => {
    const count = _notesData.filter(n => !isArchived(n) && n.tags && n.tags.includes(t)).length;
    const active = _activeTagFilter === t ? ' active' : '';
    return `<button class="notes-tag-chip${active}" data-tag="${escapeHtml(t)}">${escapeHtml(t)} <span class="notes-tag-count">${count}</span></button>`;
  }).join('') + (_activeTagFilter ? '<button class="notes-tag-clear">Clear</button>' : '');

  bar.querySelectorAll('.notes-tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _activeTagFilter = _activeTagFilter === chip.dataset.tag ? null : chip.dataset.tag;
      _activeNoteId = null;
      renderNotesTagBar();
      renderNotesList();
    });
  });

  const clearBtn = bar.querySelector('.notes-tag-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _activeTagFilter = null;
      renderNotesTagBar();
      renderNotesList();
    });
  }
}

// ─── List View ───

function renderNotesList() {
  const container = document.getElementById('notesList');
  const empty = document.getElementById('notesEmpty');
  if (!container) return;

  if (_activeNoteId) {
    renderNoteEditor();
    if (empty) empty.style.display = 'none';
    return;
  }

  let notes = _notesData.filter(n => _viewMode === 'archived' ? isArchived(n) : !isArchived(n));
  if (_activeTagFilter) {
    notes = notes.filter(n => n.tags && n.tags.includes(_activeTagFilter));
  }

  if (notes.length === 0) {
    container.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = _viewMode === 'archived' ? 'No archived notes.' : 'No notes yet. Type above to capture one.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  const pinned = notes.filter(n => n.pinned && !isArchived(n));
  const regular = notes.filter(n => !n.pinned);

  let html = '';

  if (_viewMode === 'active' && pinned.length > 0) {
    html += '<div class="notes-section-label">Pinned</div>';
    html += pinned.map(renderNoteCard).join('');
    if (regular.length > 0) html += '<div class="notes-section-label">Notes</div>';
  }

  html += regular.map(renderNoteCard).join('');
  container.innerHTML = html;

  // Wire card clicks
  container.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      _activeNoteId = card.dataset.id;
      renderNotesList();
    });
  });

  // Wire pin
  container.querySelectorAll('.note-pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const note = _notesData.find(n => n.id === btn.dataset.id);
      if (!note) return;
      note.pinned = !note.pinned;
      renderNotesList();
      await db.updateNote(note.id, { pinned: note.pinned });
    });
  });

  // Wire archive/restore
  container.querySelectorAll('.note-archive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const note = _notesData.find(n => n.id === btn.dataset.id);
      if (!note) return;
      if (isArchived(note)) {
        // Restore
        note.archived_at = null;
        note.pinned = false;
        renderNotesList();
        renderNotesTagBar();
        await db.updateNote(note.id, { archived_at: null });
      } else {
        // Archive with undo
        note.archived_at = new Date().toISOString();
        note.pinned = false;
        renderNotesList();
        renderNotesTagBar();
        showUndoToast(note, 'archived');
        await db.updateNote(note.id, { archived_at: note.archived_at, pinned: false });
      }
    });
  });

  // Wire delete
  container.querySelectorAll('.note-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this note permanently?')) return;
      const id = btn.dataset.id;
      _notesData = _notesData.filter(n => n.id !== id);
      renderNotesList();
      renderNotesTagBar();
      await db.deleteNote(id);
    });
  });
}

function renderNoteCard(note) {
  const date = new Date(note.updated_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = note.title || 'Untitled';
  const format = detectFormat(note.content);
  const archived = isArchived(note);

  let preview = '';
  if (format === 'checklist') {
    const items = parseChecklist(note.content);
    const done = items.filter(i => i.done).length;
    preview = `${done}/${items.length} done`;
  } else {
    preview = (note.content || '').slice(0, 100).replace(/\n/g, ' ');
  }

  const formatIcon = format === 'checklist' ? '<span class="note-card-icon">&#9745;</span>' : '';
  const tagsHtml = (note.tags || []).length > 0
    ? `<div class="note-card-tags">${note.tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  return `<div class="note-card" data-id="${note.id}">
    <div class="note-card-header">
      ${formatIcon}<span class="note-card-title">${escapeHtml(title)}</span>
      <span class="note-card-date">${dateStr}</span>
    </div>
    <div class="note-card-preview">${escapeHtml(preview) || 'Empty note'}</div>
    ${tagsHtml}
    <div class="note-card-actions">
      ${!archived ? `<button class="note-pin-btn${note.pinned ? ' pinned' : ''}" data-id="${note.id}" title="${note.pinned ? 'Unpin' : 'Pin'}">&#128204;</button>` : ''}
      <button class="note-archive-btn" data-id="${note.id}" title="${archived ? 'Restore' : 'Archive'}">${archived ? '&#8634;' : '&#128230;'}</button>
      <button class="note-delete-btn" data-id="${note.id}" title="Delete">&times;</button>
    </div>
  </div>`;
}

// ─── Undo Toast ───

function showUndoToast(note, action) {
  const toast = document.getElementById('notesUndoToast');
  if (!toast) return;
  clearTimeout(_undoTimer);
  toast.innerHTML = `Note ${action}. <button class="notes-undo-btn">Undo</button>`;
  toast.style.display = 'flex';

  toast.querySelector('.notes-undo-btn').addEventListener('click', async () => {
    note.archived_at = null;
    toast.style.display = 'none';
    renderNotesList();
    renderNotesTagBar();
    await db.updateNote(note.id, { archived_at: null });
  });

  _undoTimer = setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

// ─── Editor ───

function renderNoteEditor() {
  const container = document.getElementById('notesList');
  if (!container) return;
  const note = _notesData.find(n => n.id === _activeNoteId);
  if (!note) { _activeNoteId = null; renderNotesList(); return; }

  const format = detectFormat(note.content);
  const tagsStr = (note.tags || []).join(', ');

  container.innerHTML = `<div class="note-editor">
    <div class="note-editor-toolbar">
      <button class="note-back-btn" title="Back to list">&larr; Back</button>
      <div class="note-format-toggle">
        <button class="note-format-btn${format === 'freeform' ? ' active' : ''}" data-format="freeform" title="Free text">&#9998; Text</button>
        <button class="note-format-btn${format === 'checklist' ? ' active' : ''}" data-format="checklist" title="Checklist">&#9745; List</button>
      </div>
      <span class="note-save-status" id="noteSaveStatus">Saved</span>
    </div>
    <input type="text" class="note-editor-title" id="noteEditorTitle" value="${escapeHtml(note.title || '')}" placeholder="Note title...">
    <div class="note-editor-tags-row">
      <span class="note-tags-label">Tags:</span>
      <input type="text" class="note-editor-tags" id="noteEditorTags" value="${escapeHtml(tagsStr)}" placeholder="e.g. career, ideas (comma separated)">
    </div>
    <div id="noteEditorBody"></div>
    <div class="note-editor-footer">
      <button class="note-editor-archive-btn" id="noteEditorArchive">${isArchived(note) ? '&#8634; Restore' : '&#128230; Archive'}</button>
      <button class="note-editor-delete-btn" id="noteEditorDelete">&times; Delete</button>
    </div>
  </div>`;

  const titleInput = document.getElementById('noteEditorTitle');
  const tagsInput = document.getElementById('noteEditorTags');
  const bodyContainer = document.getElementById('noteEditorBody');
  const saveStatus = document.getElementById('noteSaveStatus');
  let saveTimeout = null;
  let currentFormat = format;

  // Setup tag autocomplete
  setupTagAutocomplete(tagsInput);

  const autoSave = () => {
    saveStatus.textContent = 'Saving...';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      note.title = titleInput.value;
      note.content = getCurrentContent();
      note.tags = tagsInput.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      note.updated_at = new Date().toISOString();
      await db.updateNote(note.id, { title: note.title, content: note.content, tags: note.tags });
      saveStatus.textContent = 'Saved';
      renderNotesTagBar();
    }, 800);
  };

  titleInput.addEventListener('input', autoSave);
  tagsInput.addEventListener('input', autoSave);

  function getCurrentContent() {
    if (currentFormat === 'checklist') {
      const items = [];
      bodyContainer.querySelectorAll('.cl-item').forEach(row => {
        const cb = row.querySelector('.cl-check');
        const input = row.querySelector('.cl-text');
        items.push({ done: cb.checked, text: input.value });
      });
      return serializeChecklist(items);
    }
    const ta = bodyContainer.querySelector('.note-editor-content');
    return ta ? ta.value : '';
  }

  function renderFreeformMode() {
    const content = currentFormat === 'checklist' ? convertToFreeform(note.content) : (note.content || '');
    currentFormat = 'freeform';
    bodyContainer.innerHTML = `<textarea class="note-editor-content" placeholder="Start writing...">${escapeHtml(content)}</textarea>`;
    const ta = bodyContainer.querySelector('.note-editor-content');
    ta.addEventListener('input', () => {
      note.content = ta.value;
      autoSave();
      ta.style.height = 'auto';
      ta.style.height = Math.max(200, ta.scrollHeight) + 'px';
    });
    ta.style.height = Math.max(200, ta.scrollHeight) + 'px';
    ta.focus();
  }

  function renderChecklistMode() {
    const content = currentFormat === 'freeform' ? convertToChecklist(note.content) : (note.content || '[ ] ');
    currentFormat = 'checklist';
    note.content = content;
    const items = parseChecklist(content);

    bodyContainer.innerHTML = `<div class="cl-list">
      ${items.map((item, i) => renderChecklistItem(item, i)).join('')}
    </div>
    <button class="cl-add-btn">+ Add item</button>`;

    wireChecklistEvents();
    checkAllDonePrompt();
  }

  function renderChecklistItem(item, index) {
    return `<div class="cl-item" data-idx="${index}">
      <input type="checkbox" class="cl-check" ${item.done ? 'checked' : ''}>
      <input type="text" class="cl-text${item.done ? ' cl-done' : ''}" value="${escapeHtml(item.text)}" placeholder="Item...">
      <button class="cl-delete" title="Remove">&times;</button>
    </div>`;
  }

  function checkAllDonePrompt() {
    const existing = bodyContainer.querySelector('.cl-all-done');
    if (existing) existing.remove();

    const items = [];
    bodyContainer.querySelectorAll('.cl-item').forEach(row => {
      const cb = row.querySelector('.cl-check');
      const input = row.querySelector('.cl-text');
      if (input.value.trim()) items.push({ done: cb.checked });
    });
    if (items.length > 0 && items.every(i => i.done)) {
      const prompt = document.createElement('div');
      prompt.className = 'cl-all-done';
      prompt.innerHTML = 'All done! <button class="cl-archive-btn">Archive this note</button>';
      bodyContainer.appendChild(prompt);
      prompt.querySelector('.cl-archive-btn').addEventListener('click', async () => {
        note.content = getCurrentContent();
        note.archived_at = new Date().toISOString();
        note.pinned = false;
        _activeNoteId = null;
        renderNotesList();
        renderNotesTagBar();
        showUndoToast(note, 'archived');
        await db.updateNote(note.id, { content: note.content, archived_at: note.archived_at, pinned: false });
      });
    }
  }

  function wireChecklistEvents() {
    bodyContainer.querySelectorAll('.cl-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const textInput = cb.parentElement.querySelector('.cl-text');
        textInput.classList.toggle('cl-done', cb.checked);
        note.content = getCurrentContent();
        autoSave();
        checkAllDonePrompt();
      });
    });

    bodyContainer.querySelectorAll('.cl-text').forEach(input => {
      input.addEventListener('input', () => { note.content = getCurrentContent(); autoSave(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const row = input.closest('.cl-item');
          const newRow = document.createElement('div');
          newRow.className = 'cl-item';
          newRow.innerHTML = `<input type="checkbox" class="cl-check">
            <input type="text" class="cl-text" value="" placeholder="Item...">
            <button class="cl-delete" title="Remove">&times;</button>`;
          row.after(newRow);
          wireChecklistEvents();
          newRow.querySelector('.cl-text').focus();
          note.content = getCurrentContent();
          autoSave();
        }
        if (e.key === 'Backspace' && input.value === '') {
          e.preventDefault();
          const row = input.closest('.cl-item');
          const allRows = bodyContainer.querySelectorAll('.cl-item');
          if (allRows.length <= 1) return;
          const prev = row.previousElementSibling;
          row.remove();
          if (prev) prev.querySelector('.cl-text').focus();
          note.content = getCurrentContent();
          autoSave();
        }
      });
    });

    bodyContainer.querySelectorAll('.cl-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.cl-item');
        const allRows = bodyContainer.querySelectorAll('.cl-item');
        if (allRows.length <= 1) { row.querySelector('.cl-text').value = ''; }
        else { row.remove(); }
        note.content = getCurrentContent();
        autoSave();
      });
    });

    const addBtn = bodyContainer.querySelector('.cl-add-btn');
    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', () => {
        const list = bodyContainer.querySelector('.cl-list');
        const newRow = document.createElement('div');
        newRow.className = 'cl-item';
        newRow.innerHTML = `<input type="checkbox" class="cl-check">
          <input type="text" class="cl-text" value="" placeholder="Item...">
          <button class="cl-delete" title="Remove">&times;</button>`;
        list.appendChild(newRow);
        wireChecklistEvents();
        newRow.querySelector('.cl-text').focus();
      });
    }
  }

  // Format toggle
  container.querySelectorAll('.note-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      note.content = getCurrentContent();
      container.querySelectorAll('.note-format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.format === 'checklist') renderChecklistMode();
      else renderFreeformMode();
      autoSave();
    });
  });

  // Back
  container.querySelector('.note-back-btn').addEventListener('click', () => {
    note.content = getCurrentContent();
    note.tags = tagsInput.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    _activeNoteId = null;
    renderNotesList();
    renderNotesTagBar();
  });

  // Archive from editor
  document.getElementById('noteEditorArchive').addEventListener('click', async () => {
    note.content = getCurrentContent();
    if (isArchived(note)) {
      note.archived_at = null;
      await db.updateNote(note.id, { archived_at: null });
    } else {
      note.archived_at = new Date().toISOString();
      note.pinned = false;
      showUndoToast(note, 'archived');
      await db.updateNote(note.id, { archived_at: note.archived_at, pinned: false });
    }
    _activeNoteId = null;
    renderNotesList();
    renderNotesTagBar();
  });

  // Delete from editor
  document.getElementById('noteEditorDelete').addEventListener('click', async () => {
    if (!confirm('Delete this note permanently?')) return;
    _notesData = _notesData.filter(n => n.id !== note.id);
    _activeNoteId = null;
    renderNotesList();
    renderNotesTagBar();
    await db.deleteNote(note.id);
  });

  // Render initial format
  if (format === 'checklist') renderChecklistMode();
  else renderFreeformMode();
  if (!note.title) titleInput.focus();
}

// ─── Tag Autocomplete ───

function setupTagAutocomplete(input) {
  const allTags = getAllTags();
  if (allTags.length === 0) return;

  let dropdown = null;

  input.addEventListener('input', () => {
    if (dropdown) dropdown.remove();
    const parts = input.value.split(',');
    const currentPart = parts[parts.length - 1].trim().toLowerCase();
    if (!currentPart) return;

    const matches = allTags.filter(t => t.startsWith(currentPart) && !parts.slice(0, -1).map(p => p.trim().toLowerCase()).includes(t));
    if (matches.length === 0) return;

    dropdown = document.createElement('div');
    dropdown.className = 'notes-tag-dropdown';
    matches.forEach(tag => {
      const opt = document.createElement('div');
      opt.className = 'notes-tag-option';
      opt.textContent = tag;
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        parts[parts.length - 1] = ' ' + tag;
        input.value = parts.join(',');
        dropdown.remove();
        dropdown = null;
        input.dispatchEvent(new Event('input'));
      });
      dropdown.appendChild(opt);
    });
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { if (dropdown) { dropdown.remove(); dropdown = null; } }, 200);
  });
}

// ─── Create ───

async function createNewNote(initialContent, openEditor = true) {
  try {
    const title = initialContent && initialContent.length <= 60 ? initialContent : '';
    const content = title ? '' : initialContent;
    const newNote = await db.insertNote({ title, content, tags: [] });
    newNote.tags = newNote.tags || [];
    _notesData.unshift(newNote);
    if (openEditor) {
      _activeNoteId = newNote.id;
    }
    renderNotesList();
    renderNotesTagBar();
  } catch (e) {
    console.error('Failed to create note:', e);
  }
}
