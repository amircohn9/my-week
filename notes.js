// notes.js — Notes tab rendering and CRUD

let _notesLoaded = false;
let _notesData = [];
let _activeNoteId = null;

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
  renderNotesList();

  const newBtn = document.getElementById('notesNewBtn');
  if (newBtn && !newBtn._bound) {
    newBtn._bound = true;
    newBtn.addEventListener('click', createNewNote);
  }
}

// Detect format from content
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

  if (_notesData.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const pinned = _notesData.filter(n => n.pinned);
  const unpinned = _notesData.filter(n => !n.pinned);

  let html = '';
  if (pinned.length > 0) {
    html += '<div class="notes-section-label">Pinned</div>';
    html += pinned.map(renderNoteCard).join('');
  }
  if (unpinned.length > 0) {
    if (pinned.length > 0) html += '<div class="notes-section-label">All Notes</div>';
    html += unpinned.map(renderNoteCard).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      _activeNoteId = card.dataset.id;
      renderNotesList();
    });
  });

  container.querySelectorAll('.note-pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const note = _notesData.find(n => n.id === id);
      if (!note) return;
      note.pinned = !note.pinned;
      renderNotesList();
      await db.updateNote(id, { pinned: note.pinned });
    });
  });

  container.querySelectorAll('.note-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Delete this note?')) return;
      _notesData = _notesData.filter(n => n.id !== id);
      renderNotesList();
      await db.deleteNote(id);
    });
  });
}

function renderNoteCard(note) {
  const date = new Date(note.updated_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = note.title || 'Untitled';
  const format = detectFormat(note.content);
  let preview = '';
  if (format === 'checklist') {
    const items = parseChecklist(note.content);
    const done = items.filter(i => i.done).length;
    preview = `Checklist: ${done}/${items.length} done`;
  } else {
    preview = (note.content || '').slice(0, 100).replace(/\n/g, ' ');
  }
  const formatIcon = format === 'checklist' ? '&#9745; ' : '';

  return `<div class="note-card" data-id="${note.id}">
    <div class="note-card-header">
      <span class="note-card-title">${formatIcon}${escapeHtml(title)}</span>
      <span class="note-card-date">${dateStr}</span>
    </div>
    <div class="note-card-preview">${escapeHtml(preview) || 'Empty note'}</div>
    <div class="note-card-actions">
      <button class="note-pin-btn${note.pinned ? ' pinned' : ''}" data-id="${note.id}" title="${note.pinned ? 'Unpin' : 'Pin'}">&#128204;</button>
      <button class="note-delete-btn" data-id="${note.id}" title="Delete">&times;</button>
    </div>
  </div>`;
}

// ─── Editor ───

function renderNoteEditor() {
  const container = document.getElementById('notesList');
  if (!container) return;
  const note = _notesData.find(n => n.id === _activeNoteId);
  if (!note) { _activeNoteId = null; renderNotesList(); return; }

  const format = detectFormat(note.content);

  container.innerHTML = `<div class="note-editor">
    <div class="note-editor-toolbar">
      <button class="note-back-btn" title="Back to list">&larr; Back</button>
      <div class="note-format-toggle">
        <button class="note-format-btn${format === 'freeform' ? ' active' : ''}" data-format="freeform" title="Free text">&#9998; Text</button>
        <button class="note-format-btn${format === 'checklist' ? ' active' : ''}" data-format="checklist" title="Checklist">&#9745; Checklist</button>
      </div>
      <span class="note-save-status" id="noteSaveStatus">Saved</span>
    </div>
    <input type="text" class="note-editor-title" id="noteEditorTitle" value="${escapeHtml(note.title || '')}" placeholder="Note title...">
    <div id="noteEditorBody"></div>
  </div>`;

  const titleInput = document.getElementById('noteEditorTitle');
  const bodyContainer = document.getElementById('noteEditorBody');
  const saveStatus = document.getElementById('noteSaveStatus');
  let saveTimeout = null;
  let currentFormat = format;

  const autoSave = () => {
    saveStatus.textContent = 'Saving...';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      note.title = titleInput.value;
      note.content = getCurrentContent();
      note.updated_at = new Date().toISOString();
      await db.updateNote(note.id, { title: note.title, content: note.content });
      saveStatus.textContent = 'Saved';
    }, 800);
  };

  titleInput.addEventListener('input', autoSave);

  function getCurrentContent() {
    if (currentFormat === 'checklist') {
      const items = [];
      bodyContainer.querySelectorAll('.cl-item').forEach(row => {
        const cb = row.querySelector('.cl-check');
        const input = row.querySelector('.cl-text');
        items.push({ done: cb.checked, text: input.value });
      });
      return serializeChecklist(items);
    } else {
      const ta = bodyContainer.querySelector('.note-editor-content');
      return ta ? ta.value : '';
    }
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
      ta.style.height = Math.max(300, ta.scrollHeight) + 'px';
    });
    ta.style.height = Math.max(300, ta.scrollHeight) + 'px';
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
  }

  function renderChecklistItem(item, index) {
    return `<div class="cl-item" data-idx="${index}">
      <input type="checkbox" class="cl-check" ${item.done ? 'checked' : ''}>
      <input type="text" class="cl-text${item.done ? ' cl-done' : ''}" value="${escapeHtml(item.text)}" placeholder="Item...">
      <button class="cl-delete" title="Remove">&times;</button>
    </div>`;
  }

  function wireChecklistEvents() {
    // Checkboxes
    bodyContainer.querySelectorAll('.cl-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const textInput = cb.parentElement.querySelector('.cl-text');
        textInput.classList.toggle('cl-done', cb.checked);
        note.content = getCurrentContent();
        autoSave();
      });
    });

    // Text inputs
    bodyContainer.querySelectorAll('.cl-text').forEach(input => {
      input.addEventListener('input', () => {
        note.content = getCurrentContent();
        autoSave();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Add new item after this one
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

    // Delete buttons
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

    // Add button
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

  // Format toggle buttons
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

  // Back button
  container.querySelector('.note-back-btn').addEventListener('click', () => {
    note.content = getCurrentContent();
    _activeNoteId = null;
    renderNotesList();
  });

  // Initial render based on detected format
  if (format === 'checklist') renderChecklistMode();
  else renderFreeformMode();

  if (!note.title) titleInput.focus();
}

async function createNewNote() {
  try {
    const newNote = await db.insertNote({ title: '', content: '' });
    _notesData.unshift(newNote);
    _activeNoteId = newNote.id;
    renderNotesList();
  } catch (e) {
    console.error('Failed to create note:', e);
  }
}
