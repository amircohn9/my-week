// contacts.js — Freelancers & service providers directory

let contactsData = [];

async function loadContacts() {
  const { data, error } = await supabaseClient.from('contacts').select('*').order('name');
  if (error) {
    console.error('Failed to load contacts:', error);
    // Fallback: use localStorage
    contactsData = JSON.parse(localStorage.getItem('contacts') || '[]');
  } else {
    contactsData = data || [];
  }
  return contactsData;
}

async function insertContact(contact) {
  try {
    const session = await db.getSession();
    const { data, error } = await supabaseClient.from('contacts').insert({
      user_id: session.user.id,
      name: contact.name,
      role: contact.role || '',
      phone: contact.phone || '',
      email: contact.email || '',
      notes: contact.notes || '',
      tags: contact.tags || [],
    }).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Insert contact failed, using localStorage fallback:', err);
    const item = { id: 'local-' + Date.now(), ...contact, tags: contact.tags || [] };
    contactsData.push(item);
    localStorage.setItem('contacts', JSON.stringify(contactsData));
    return item;
  }
}

async function updateContact(id, fields) {
  try {
    const { error } = await supabaseClient.from('contacts').update(fields).eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('Update contact failed:', err);
    const idx = contactsData.findIndex(c => c.id === id);
    if (idx >= 0) Object.assign(contactsData[idx], fields);
    localStorage.setItem('contacts', JSON.stringify(contactsData));
  }
}

async function deleteContact(id) {
  try {
    const { error } = await supabaseClient.from('contacts').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('Delete contact failed:', err);
  }
  contactsData = contactsData.filter(c => c.id !== id);
  localStorage.setItem('contacts', JSON.stringify(contactsData));
}

function renderContacts(filter) {
  const container = document.getElementById('contactsList');
  const countEl = document.getElementById('contactsCount');
  if (!container) return;

  filter = (filter || '').toLowerCase().trim();

  let filtered = contactsData;
  if (filter) {
    filtered = contactsData.filter(c => {
      const searchable = [c.name, c.role, c.notes, ...(c.tags || [])].join(' ').toLowerCase();
      return searchable.includes(filter);
    });
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} contact${filtered.length !== 1 ? 's' : ''}`;
  }

  // Collect all unique tags for filter chips
  const allTags = new Set();
  contactsData.forEach(c => (c.tags || []).forEach(t => allTags.add(t)));

  const tagsHtml = allTags.size > 0
    ? `<div class="contacts-tags">${[...allTags].sort().map(t =>
        `<button class="contacts-tag-chip${filter === t.toLowerCase() ? ' active' : ''}" data-tag="${t}">${escapeHtml(t)}</button>`
      ).join('')}</div>`
    : '';

  if (filtered.length === 0) {
    container.innerHTML = tagsHtml + `<p class="empty-state">${filter ? 'No matches for "' + escapeHtml(filter) + '"' : 'No contacts yet. Add your first one above.'}</p>`;
  } else {
    container.innerHTML = tagsHtml + filtered.map(c => {
      const tagsStr = (c.tags || []).map(t => `<span class="contact-tag">${escapeHtml(t)}</span>`).join('');
      const phoneLink = c.phone ? `<a href="tel:${c.phone}" class="contact-phone">${escapeHtml(c.phone)}</a>` : '';
      const emailLink = c.email ? `<a href="mailto:${c.email}" class="contact-email">${escapeHtml(c.email)}</a>` : '';
      return `<div class="contact-card" data-id="${c.id}">
        <div class="contact-card-header">
          <span class="contact-name">${escapeHtml(c.name)}</span>
          <span class="contact-role">${escapeHtml(c.role || '')}</span>
          <button class="contact-delete-btn" data-id="${c.id}" title="Delete">&#128465;</button>
        </div>
        <div class="contact-details">
          ${phoneLink}${emailLink}
          ${c.notes ? `<span class="contact-notes">${escapeHtml(c.notes)}</span>` : ''}
        </div>
        ${tagsStr ? `<div class="contact-tags-row">${tagsStr}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Tag chip click — filter by tag
  container.querySelectorAll('.contacts-tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag.toLowerCase();
      const searchInput = document.getElementById('contactsSearch');
      if (searchInput) {
        // Toggle: if already filtering by this tag, clear it
        if (searchInput.value.toLowerCase().trim() === tag) {
          searchInput.value = '';
          renderContacts('');
        } else {
          searchInput.value = chip.dataset.tag;
          renderContacts(tag);
        }
      }
    });
  });

  // Delete
  container.querySelectorAll('.contact-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this contact?')) return;
      const id = btn.dataset.id;
      // deleteContact handles removing from contactsData
      await deleteContact(id);
      renderContacts(filter);
    });
  });

  // Click card to edit
  container.querySelectorAll('.contact-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const c = contactsData.find(x => x.id === id);
      if (!c) return;
      showContactEditForm(c, filter);
    });
  });
}

function showContactEditForm(contact, currentFilter) {
  const container = document.getElementById('contactsList');
  const card = container.querySelector(`.contact-card[data-id="${contact.id}"]`);
  if (!card) return;

  card.innerHTML = `<div class="contact-edit-form">
    <input type="text" class="contact-edit-name" value="${escapeHtml(contact.name)}" placeholder="Name">
    <input type="text" class="contact-edit-role" value="${escapeHtml(contact.role || '')}" placeholder="Role (e.g. plumber, babysitter)">
    <input type="tel" class="contact-edit-phone" value="${escapeHtml(contact.phone || '')}" placeholder="Phone">
    <input type="email" class="contact-edit-email" value="${escapeHtml(contact.email || '')}" placeholder="Email">
    <input type="text" class="contact-edit-tags" value="${(contact.tags || []).join(', ')}" placeholder="Tags (comma separated)">
    <textarea class="contact-edit-notes" rows="2" placeholder="Notes">${escapeHtml(contact.notes || '')}</textarea>
    <div class="contact-edit-actions">
      <button class="contact-edit-save">Save</button>
      <button class="contact-edit-cancel">Cancel</button>
    </div>
  </div>`;

  const save = async () => {
    const fields = {
      name: card.querySelector('.contact-edit-name').value.trim() || contact.name,
      role: card.querySelector('.contact-edit-role').value.trim(),
      phone: card.querySelector('.contact-edit-phone').value.trim(),
      email: card.querySelector('.contact-edit-email').value.trim(),
      tags: card.querySelector('.contact-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes: card.querySelector('.contact-edit-notes').value.trim(),
    };
    Object.assign(contact, fields);
    renderContacts(currentFilter);
    await updateContact(contact.id, fields);
  };

  card.querySelector('.contact-edit-save').addEventListener('click', save);
  card.querySelector('.contact-edit-cancel').addEventListener('click', () => renderContacts(currentFilter));
  card.querySelector('.contact-edit-name').focus();
}

function setupContactsTab() {
  const form = document.getElementById('contactForm');
  const searchInput = document.getElementById('contactsSearch');

  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener('input', () => {
      renderContacts(searchInput.value);
    });
  }

  if (form && !form._bound) {
    form._bound = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('contactName').value.trim();
      const role = document.getElementById('contactRole').value.trim();
      const phone = document.getElementById('contactPhone').value.trim();
      const email = document.getElementById('contactEmail').value.trim();
      const tags = document.getElementById('contactTags').value.split(',').map(t => t.trim()).filter(Boolean);
      if (!name) return;

      const newContact = await insertContact({ name, role, phone, email, tags });
      // Only push if insertContact didn't already add to contactsData (Supabase success path)
      if (!contactsData.some(c => c.id === newContact.id)) {
        contactsData.push(newContact);
      }

      form.reset();
      renderContacts(searchInput ? searchInput.value : '');
    });
  }
}

async function initContacts() {
  await loadContacts();
  renderContacts('');
  setupContactsTab();
}
