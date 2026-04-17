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

  // Wire up "New Note" button
  const newBtn = document.getElementById('notesNewBtn');
  if (newBtn && !newBtn._bound) {
    newBtn._bound = true;
    newBtn.addEventListener('click', createNewNote);
  }
}

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

  // Wire card clicks
  container.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      _activeNoteId = card.dataset.id;
      renderNotesList();
    });
  });

  // Wire pin toggles
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

  // Wire delete
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
  const preview = (note.content || '').slice(0, 100).replace(/\n/g, ' ');

  return `<div class="note-card" data-id="${note.id}">
    <div class="note-card-header">
      <span class="note-card-title">${escapeHtml(title)}</span>
      <span class="note-card-date">${dateStr}</span>
    </div>
    <div class="note-card-preview">${escapeHtml(preview) || 'Empty note'}</div>
    <div class="note-card-actions">
      <button class="note-pin-btn${note.pinned ? ' pinned' : ''}" data-id="${note.id}" title="${note.pinned ? 'Unpin' : 'Pin'}">&#128204;</button>
      <button class="note-delete-btn" data-id="${note.id}" title="Delete">&times;</button>
    </div>
  </div>`;
}

function renderNoteEditor() {
  const container = document.getElementById('notesList');
  if (!container) return;
  const note = _notesData.find(n => n.id === _activeNoteId);
  if (!note) { _activeNoteId = null; renderNotesList(); return; }

  container.innerHTML = `<div class="note-editor">
    <div class="note-editor-toolbar">
      <button class="note-back-btn" title="Back to list">&larr; Back</button>
      <span class="note-save-status" id="noteSaveStatus">Saved</span>
    </div>
    <input type="text" class="note-editor-title" id="noteEditorTitle" value="${escapeHtml(note.title || '')}" placeholder="Note title...">
    <textarea class="note-editor-content" id="noteEditorContent" placeholder="Start writing...">${escapeHtml(note.content || '')}</textarea>
  </div>`;

  const titleInput = document.getElementById('noteEditorTitle');
  const contentArea = document.getElementById('noteEditorContent');
  const saveStatus = document.getElementById('noteSaveStatus');
  let saveTimeout = null;

  const autoSave = () => {
    saveStatus.textContent = 'Saving...';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      note.title = titleInput.value;
      note.content = contentArea.value;
      note.updated_at = new Date().toISOString();
      await db.updateNote(note.id, { title: note.title, content: note.content });
      saveStatus.textContent = 'Saved';
    }, 800);
  };

  titleInput.addEventListener('input', autoSave);
  contentArea.addEventListener('input', autoSave);

  // Auto-resize textarea
  const resize = () => {
    contentArea.style.height = 'auto';
    contentArea.style.height = Math.max(300, contentArea.scrollHeight) + 'px';
  };
  contentArea.addEventListener('input', resize);
  resize();

  // Back button
  container.querySelector('.note-back-btn').addEventListener('click', () => {
    _activeNoteId = null;
    renderNotesList();
  });

  // Focus content if title is already set
  if (note.title) contentArea.focus();
  else titleInput.focus();
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
