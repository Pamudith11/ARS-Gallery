// ===================================
// ARS GALLERY — script.js
// ===================================

/* ---- NAVBAR SCROLL ---- */
const navbar = document.getElementById('navbar');
const btt = document.getElementById('btt');

if (navbar) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
      if (btt) btt.classList.add('visible');
    } else {
      navbar.classList.remove('scrolled');
      if (btt) btt.classList.remove('visible');
    }
  });
}

/* ---- MOBILE MENU ---- */
const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobile-nav');

if (burger && mobileNav) {
  burger.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
    const spans = burger.querySelectorAll('span');
    mobileNav.classList.contains('open')
      ? spans.forEach((s, i) => {
          if (i === 0) { s.style.transform = 'rotate(45deg) translate(5px, 5px)'; }
          if (i === 1) { s.style.opacity = '0'; }
          if (i === 2) { s.style.transform = 'rotate(-45deg) translate(5px, -5px)'; }
        })
      : spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  });

  document.querySelectorAll('.mob-link').forEach(l => {
    l.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      burger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    });
  });
}

/* ---- SMOOTH SCROLL for nav links ---- */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ---- COUNTER ANIMATION ---- */
function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-to'));
  const duration = 2000;
  const start = performance.now();
  const step = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

const counters = document.querySelectorAll('.stat-n');
if (counters.length) {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target);
        counterObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(c => counterObserver.observe(c));
}

/* ---- GALLERY FILTER ---- */
const STORAGE_KEYS = {
  bookings: 'ars_gallery_bookings'
};

let firebaseClient;
let firebaseApp;
let firebaseAuth;
let firestore;
let firebaseAuthModule;
let firestoreModule;
let firebaseCurrentUser = null;
let firebaseReady;
let firebaseAuthStateReady;
let stopAdminListeners = [];
let firebaseAdminBookings = null;
let firebaseAdminUsers = null;

// Gallery/package data now lives in Firestore (collections: categories, albums, packages).
// null = not loaded yet.
const siteData = {
  categories: null,
  albums: null,
  packages: null,
  failed: false,
  errors: {}
};
let stopSiteListeners = [];
let presenceTimer = null;

function isAdminPage() {
  return Boolean(document.body && document.body.getAttribute('data-admin-page') === 'true');
}

function isSiteDataLoading() {
  return !siteData.failed && (siteData.categories === null || siteData.albums === null || siteData.packages === null);
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getSignedInUser() {
  return firebaseCurrentUser;
}

function slugify(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

function getDefaultGalleryState() {
  return {
    categories: ['Wedding', 'Portrait', 'Events', 'Couples', 'Graduation', 'Birthdays'],
    albums: [
      { id: 'wedding-1', category: 'Wedding', title: 'Wedding Moments', description: 'Timeless Love Stories', image: '../images/gallery_wedding.png' },
      { id: 'portrait-1', category: 'Portrait', title: 'Portrait Session', description: 'Capturing True Beauty', image: '../images/gallery_portrait.png' },
      { id: 'couples-1', category: 'Couples', title: 'Couple Shoot', description: 'Love in Every Frame', image: '../images/gallery_couple.png' },
      { id: 'event-1', category: 'Events', title: 'Event Photography', description: 'Every Celebration Counts', image: '../images/gallery_event.png' },
      { id: 'graduation-1', category: 'Graduation', title: 'Graduation Day', description: 'Milestone Memories', image: '../images/gallery_portrait.png' },
      { id: 'birthday-1', category: 'Birthdays', title: 'Birthday Celebration', description: 'Joyful Moments', image: '../images/gallery_event.png' }
    ]
  };
}

function normalizeAlbum(album, index) {
  const imageList = Array.isArray(album.images) && album.images.length
    ? album.images
    : (album.image ? [album.image] : []);

  return {
    id: album.id || `album-${index}-${Date.now()}`,
    category: album.category || 'General',
    title: album.title || `Album ${index + 1}`,
    description: album.description || 'New album shot',
    images: imageList
  };
}

function getGalleryState() {
  if (siteData.categories === null || siteData.albums === null) {
    return siteData.failed ? getDefaultGalleryState() : { categories: [], albums: [] };
  }
  const isEmpty = !siteData.categories.length && !siteData.albums.length;
  // Visitors see the sample content until the admin adds real data.
  if (isEmpty && !isAdminPage()) return getDefaultGalleryState();
  return {
    categories: siteData.categories.map((category) => category.name),
    albums: siteData.albums.map(normalizeAlbum)
  };
}

function getBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.bookings);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveBookings(bookings) {
  localStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(bookings));
}

function getDefaultPackages() {
  return [
    {
      id: 'package-wedding',
      title: 'Wedding Story',
      price: 'LKR 85,000',
      features: ['8 hours coverage', '2 photographers', 'Online gallery', 'Printed album']
    },
    {
      id: 'package-portrait',
      title: 'Portrait Signature',
      price: 'LKR 35,000',
      features: ['1 outfit change', 'Studio or outdoor', '16 edited portraits', 'Fast delivery'],
      featured: true
    },
    {
      id: 'package-event',
      title: 'Event Moments',
      price: 'LKR 55,000',
      features: ['4 hours coverage', 'Candid storytelling', 'High-resolution gallery', 'Sneak peek set']
    }
  ];
}

function getPackages() {
  if (siteData.packages === null) {
    return siteData.failed ? getDefaultPackages() : [];
  }
  if (!siteData.packages.length && !isAdminPage()) return getDefaultPackages();
  return siteData.packages;
}

function renderGalleryPage() {
  const filters = document.querySelector('.gal-filters');
  const grid = document.getElementById('gal-grid');
  if (!filters || !grid) return;
  if (isSiteDataLoading()) return; // keep the static markup until Firestore answers

  const state = getGalleryState();
  const categoryNames = state.categories || [];

  filters.innerHTML = [
    '<button class="gf active" data-f="all">All</button>',
    ...categoryNames.map((category) => `<button class="gf" data-f="${escapeHTML(slugify(category))}">${escapeHTML(category)}</button>`)
  ].join('');

  grid.innerHTML = (state.albums || []).map((album) => {
    const primaryImage = escapeHTML((album.images && album.images[0]) || '');
    return `
      <div class="gal-item" data-cat="${escapeHTML(slugify(album.category))}">
        <img src="${primaryImage}" alt="${escapeHTML(album.title)}" loading="lazy" />
        <div class="gal-ov">
          <h4>${escapeHTML(album.title)}</h4>
          <p>${escapeHTML(album.description)}</p>
          <button onclick="lb(this)" data-s="${primaryImage}">View ⊕</button>
        </div>
      </div>
    `;
  }).join('');

  bindGalleryFilters();
}

function bindGalleryFilters() {
  const filterBtns = document.querySelectorAll('.gf');
  const galItems = document.querySelectorAll('.gal-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-f');
      galItems.forEach(item => {
        const cat = item.getAttribute('data-cat');
        if (filter === 'all' || cat === filter) {
          item.style.display = '';
          item.style.animation = 'fadeUp 0.4s ease both';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
}

function renderAdminSetupPanel() {
  const panel = document.getElementById('adminSetupPanel');
  const text = document.getElementById('adminSetupMessage');
  const seedButton = document.getElementById('seedSampleData');
  if (!panel || !text) return;

  const errorMessages = Object.values(siteData.errors);
  if (errorMessages.length) {
    panel.hidden = false;
    text.textContent = `Could not load gallery data: ${errorMessages[0]} (Publish the updated firestore.rules in Firebase Console > Firestore Database > Rules.)`;
    text.classList.add('auth-error');
    if (seedButton) seedButton.hidden = true;
    return;
  }

  const loaded = siteData.categories !== null && siteData.albums !== null && siteData.packages !== null;
  const isEmpty = loaded && !siteData.categories.length && !siteData.albums.length && !siteData.packages.length;
  panel.hidden = !isEmpty;
  text.classList.remove('auth-error');
  if (isEmpty) {
    text.textContent = 'Your gallery database is empty, so visitors currently see built-in sample content. Load the sample categories, albums and packages to start editing them.';
    if (seedButton) seedButton.hidden = false;
  }
}

function renderAdminDashboard(options = {}) {
  const categoryList = document.getElementById('adminCategoryList');
  const albumList = document.getElementById('adminAlbumList');
  const packageList = document.getElementById('adminPackageList');
  const bookingList = document.getElementById('adminBookingList');
  const userList = document.getElementById('adminUserList');
  const categorySelect = document.getElementById('albumCategory');

  if (!categoryList && !albumList && !packageList && !bookingList && !userList) return;

  renderAdminSetupPanel();
  const state = getGalleryState();

  if (categoryList) {
    categoryList.innerHTML = state.categories.map((category) => `
      <div class="admin-tag-card">
        <span>${escapeHTML(category)}</span>
        <button type="button" data-category="${escapeHTML(category)}" class="mini-delete">Delete</button>
      </div>
    `).join('');

    categoryList.querySelectorAll('.mini-delete').forEach((button) => {
      button.addEventListener('click', () => {
        const category = button.getAttribute('data-category');
        const albumCount = state.albums.filter((album) => album.category === category).length;
        const warning = albumCount
          ? `Delete the "${category}" category and its ${albumCount} album${albumCount === 1 ? '' : 's'}?`
          : `Delete the "${category}" category?`;
        if (!window.confirm(warning)) return;
        runAdminAction(() => deleteGalleryCategory(category), 'Category deleted.');
      });
    });
  }

  if (categorySelect) {
    const previous = categorySelect.value;
    categorySelect.innerHTML = state.categories
      .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`)
      .join('');
    if (previous && state.categories.includes(previous)) categorySelect.value = previous;
  }

  if (albumList) {
    albumList.innerHTML = (state.albums || []).map((album) => {
      const images = album.images && album.images.length ? album.images : [''];
      return `
        <div class="admin-album-item">
          <img src="${escapeHTML(images[0])}" alt="${escapeHTML(album.title)}" />
          <div>
            <strong>${escapeHTML(album.title)}</strong>
            <p>${escapeHTML(album.category)}</p>
            <small>${escapeHTML(album.description)}${images.length > 1 ? ` • ${images.length} photos` : ''}</small>
          </div>
          <button type="button" data-album-id="${escapeHTML(album.id)}" class="mini-delete">Remove</button>
        </div>
      `;
    }).join('');

    albumList.querySelectorAll('.mini-delete').forEach((button) => {
      button.addEventListener('click', () => {
        if (!window.confirm('Remove this album?')) return;
        runAdminAction(() => deleteGalleryAlbum(button.getAttribute('data-album-id')), 'Album removed.');
      });
    });
  }

  // Booking/user snapshots must not wipe a package form the admin is typing in.
  if (packageList && !(options.skipPackages && packageList.contains(document.activeElement))) {
    const packages = getPackages();
    packageList.innerHTML = packages.map((item) => `
      <form class="admin-package-item" data-package-id="${escapeHTML(item.id)}">
        <label class="auth-field">Package name
          <input name="title" value="${escapeHTML(item.title)}" required />
        </label>
        <label class="auth-field">Price
          <input name="price" value="${escapeHTML(item.price)}" required />
        </label>
        <label class="auth-field">Features (one per line)
          <textarea name="features" rows="4">${escapeHTML((item.features || []).join('\n'))}</textarea>
        </label>
        <label class="admin-featured-toggle">
          <input name="featured" type="checkbox" ${item.featured ? 'checked' : ''} />
          Highlight this package
        </label>
        <div class="admin-package-actions">
          <button type="submit" class="btn-primary">Save Package</button>
          <button type="button" class="mini-delete" data-delete-package="${escapeHTML(item.id)}">Delete</button>
        </div>
      </form>
    `).join('');

    packageList.querySelectorAll('.admin-package-item').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        runAdminAction(() => updatePackage(form.getAttribute('data-package-id'), {
          title: String(formData.get('title') || '').trim(),
          price: String(formData.get('price') || '').trim(),
          features: String(formData.get('features') || '').split('\n').map((feature) => feature.trim()).filter(Boolean),
          featured: formData.has('featured')
        }), 'Package saved.');
      });
    });

    packageList.querySelectorAll('[data-delete-package]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!window.confirm('Delete this package?')) return;
        runAdminAction(() => deletePackage(button.getAttribute('data-delete-package')), 'Package deleted.');
      });
    });
  }

  if (bookingList) {
    const canManageBookings = firebaseAdminBookings !== null;
    const bookings = canManageBookings ? firebaseAdminBookings : getBookings();
    if (!bookings.length) {
      bookingList.innerHTML = '<div class="empty-state">No bookings yet.</div>';
    } else {
      bookingList.innerHTML = bookings.map((booking) => `
        <div class="admin-booking-item">
          <div>
            <strong>${escapeHTML(booking.name || 'Guest')}</strong>
            <p>${escapeHTML(booking.email || 'No email')}</p>
            ${booking.phone ? `<small>Phone: ${escapeHTML(booking.phone)}</small>` : ''}
            ${booking.accountEmail ? `<small>Google account: ${escapeHTML(booking.accountEmail)}</small>` : ''}
          </div>
          <div>
            <span>${escapeHTML(booking.service || 'Session')}</span>
            <small>Session date: ${escapeHTML(formatAppointment(booking.date, booking.time))}</small>
            ${booking.createdAt ? `<small>Booked on: ${escapeHTML(formatBookingDate(booking.createdAt))}</small>` : ''}
            ${booking.notes ? `<p>${escapeHTML(booking.notes)}</p>` : ''}
            ${canManageBookings && booking.id ? `<button type="button" class="mini-delete" data-booking-id="${escapeHTML(booking.id)}">Delete</button>` : ''}
          </div>
        </div>
      `).join('');

      bookingList.querySelectorAll('[data-booking-id]').forEach((button) => {
        button.addEventListener('click', () => {
          if (!window.confirm('Delete this booking?')) return;
          runAdminAction(() => deleteBooking(button.getAttribute('data-booking-id')), 'Booking deleted.');
        });
      });
    }
  }

  const bookedClientsList = document.getElementById('adminBookedClientsList');
  if (bookedClientsList) {
    const bookings = firebaseAdminBookings || [];
    const users = firebaseAdminUsers || [];
    const groups = new Map();
    bookings.forEach((booking) => {
      const key = booking.uid || booking.accountEmail || booking.email || booking.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(booking);
    });
    if (!groups.size) {
      bookedClientsList.innerHTML = '<div class="empty-state">No clients have booked yet.</div>';
    } else {
      bookedClientsList.innerHTML = Array.from(groups.entries()).map(([key, list]) => {
        const user = users.find((item) => item.uid === key);
        const name = (user && user.displayName) || list[0].name || 'Client';
        const email = (user && user.email) || list[0].accountEmail || list[0].email || '';
        const sessions = list.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        return `
          <div class="admin-user-item">
            ${user && user.photoURL ? `<img src="${escapeHTML(user.photoURL)}" alt="" referrerpolicy="no-referrer" />` : '<span class="admin-user-avatar" aria-hidden="true">C</span>'}
            <div class="admin-user-details">
              <strong>${escapeHTML(name)}</strong>
              <p>${escapeHTML(email)}</p>
              ${sessions.map((booking) => `<small>${escapeHTML(formatAppointment(booking.date, booking.time))} — ${escapeHTML(booking.service || 'Session')}${booking.createdAt ? ` (booked ${escapeHTML(formatBookingDate(booking.createdAt))})` : ''}</small>`).join('')}
            </div>
            <div class="admin-user-last-seen">
              <span>${list.length} booking${list.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (userList) {
    const users = firebaseAdminUsers || [];
    const bookings = firebaseAdminBookings || [];
    if (!users.length) {
      userList.innerHTML = '<div class="empty-state">No signed-in users yet.</div>';
    } else {
      userList.innerHTML = users.map((user) => {
        const lastSeen = user.lastSeenAt && typeof user.lastSeenAt.toDate === 'function'
          ? user.lastSeenAt.toDate()
          : (user.lastSeenAt ? new Date(user.lastSeenAt) : null);
        const hasLastSeen = lastSeen && !Number.isNaN(lastSeen.getTime());
        const lastSeenText = hasLastSeen ? lastSeen.toLocaleString() : 'Not available';
        const isOnline = hasLastSeen && Date.now() - lastSeen.getTime() < 5 * 60 * 1000;
        const userBookings = bookings.filter((booking) => booking.uid === user.uid);
        const bookingSummary = userBookings.length
          ? `Booked ${userBookings.length} session${userBookings.length === 1 ? '' : 's'}: ${userBookings.map((booking) => formatAppointment(booking.date, booking.time)).join(', ')}`
          : 'No bookings yet';
        return `
          <div class="admin-user-item">
            ${user.photoURL ? `<img src="${escapeHTML(user.photoURL)}" alt="" referrerpolicy="no-referrer" />` : '<span class="admin-user-avatar" aria-hidden="true">G</span>'}
            <div class="admin-user-details">
              <strong>${escapeHTML(user.displayName || 'Google user')}</strong>
              <p>${escapeHTML(user.email || 'No email')}</p>
              <small>${escapeHTML(bookingSummary)}</small>
            </div>
            <div class="admin-user-last-seen">
              <span${isOnline ? ' style="color:#6ee7a0"' : ''}>${isOnline ? '● Online now' : 'Last seen'}</span>
              <small>${escapeHTML(lastSeenText)}</small>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function formatAppointment(date, time) {
  let dateText = date || 'No date';
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      dateText = parsed.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
  return time ? `${dateText} • ${time}` : dateText;
}

function formatBookingDate(value) {
  const date = value && typeof value.toDate === 'function'
    ? value.toDate()
    : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function renderTestimonialPackages() {
  const container = document.getElementById('testimonialPackages');
  if (!container) return;
  if (isSiteDataLoading()) return; // keep the static markup until Firestore answers
  container.innerHTML = getPackages().map((item) => `
    <article class="package-card${item.featured ? ' featured' : ''}">
      <h3>${escapeHTML(item.title)}</h3>
      <p class="package-price">${escapeHTML(item.price)}</p>
      <ul>${(item.features || []).map((feature) => `<li>${escapeHTML(feature)}</li>`).join('')}</ul>
    </article>
  `).join('');
}

/* ---- ADMIN DATA (Firestore) ---- */
const MAX_ALBUM_PAYLOAD_CHARS = 900000; // Firestore documents are limited to ~1 MiB

function setAdminActionMessage(text, isError) {
  const element = document.getElementById('adminActionMessage');
  if (!element) return;
  element.textContent = text || '';
  element.hidden = !text;
  element.classList.toggle('auth-error', Boolean(isError));
}

async function runAdminAction(action, successMessage) {
  try {
    setAdminActionMessage('Saving...', false);
    const result = await action();
    setAdminActionMessage(result === false ? '' : (successMessage || 'Saved.'), false);
    return result;
  } catch (error) {
    setAdminActionMessage(getAdminErrorMessage(error), true);
    return false;
  }
}

function getAdminErrorMessage(error) {
  if (error && error.code === 'permission-denied') {
    return 'Permission denied. Make sure the updated firestore.rules are published and you are signed in with the admin account.';
  }
  return (error && error.message) || 'Something went wrong. Please try again.';
}

async function requireAdminFirestore() {
  await firebaseReady;
  await firebaseAuthStateReady;
  if (!firestore || !firestoreModule || !firebaseClient) {
    throw new Error('Firebase is not ready. Open the site through localhost or HTTPS and try again.');
  }
  if (!firebaseCurrentUser || firebaseCurrentUser.uid !== firebaseClient.adminUid) {
    throw new Error('Only the admin account can change site content.');
  }
  return { db: firestore, fs: firestoreModule };
}

async function addGalleryCategory(categoryName) {
  const value = String(categoryName || '').trim();
  if (!value) return false;
  const exists = getGalleryState().categories.some((item) => item.toLowerCase() === value.toLowerCase());
  if (exists) throw new Error(`The category "${value}" already exists.`);
  const { db, fs } = await requireAdminFirestore();
  await fs.setDoc(fs.doc(db, 'categories', slugify(value)), { name: value, createdAt: Date.now() });
  return true;
}

async function deleteGalleryCategory(categoryName) {
  const { db, fs } = await requireAdminFirestore();
  const category = (siteData.categories || []).find((item) => item.name === categoryName);
  const batch = fs.writeBatch(db);
  if (category) batch.delete(fs.doc(db, 'categories', category.id));
  (siteData.albums || [])
    .filter((album) => album.category === categoryName)
    .forEach((album) => batch.delete(fs.doc(db, 'albums', album.id)));
  await batch.commit();
}

async function addGalleryAlbum(payload) {
  if (!payload.category || !String(payload.title || '').trim()) return false;
  const images = payload.images && payload.images.length ? payload.images : (payload.image ? [payload.image] : []);
  if (!images.length) return false;
  const payloadSize = images.reduce((total, image) => total + String(image).length, 0);
  if (payloadSize > MAX_ALBUM_PAYLOAD_CHARS) {
    throw new Error('These images are too large for one album. Upload fewer photos per album.');
  }
  const { db, fs } = await requireAdminFirestore();
  await fs.addDoc(fs.collection(db, 'albums'), {
    category: payload.category,
    title: String(payload.title).trim(),
    description: String(payload.description || '').trim() || 'New album shot',
    images,
    createdAt: Date.now()
  });
  return true;
}

async function deleteGalleryAlbum(albumId) {
  const { db, fs } = await requireAdminFirestore();
  await fs.deleteDoc(fs.doc(db, 'albums', albumId));
}

async function addPackage(data) {
  const { db, fs } = await requireAdminFirestore();
  await fs.addDoc(fs.collection(db, 'packages'), {
    title: data.title,
    price: data.price,
    features: data.features,
    featured: Boolean(data.featured),
    createdAt: Date.now()
  });
}

async function updatePackage(packageId, data) {
  const { db, fs } = await requireAdminFirestore();
  await fs.setDoc(fs.doc(db, 'packages', packageId), {
    title: data.title,
    price: data.price,
    features: data.features,
    featured: Boolean(data.featured)
  }, { merge: true });
}

async function deletePackage(packageId) {
  const { db, fs } = await requireAdminFirestore();
  await fs.deleteDoc(fs.doc(db, 'packages', packageId));
}

async function deleteBooking(bookingId) {
  const { db, fs } = await requireAdminFirestore();
  await fs.deleteDoc(fs.doc(db, 'bookings', bookingId));
}

async function seedSampleData() {
  const { db, fs } = await requireAdminFirestore();
  const defaults = getDefaultGalleryState();
  const now = Date.now();
  const batch = fs.writeBatch(db);
  defaults.categories.forEach((name, index) => {
    batch.set(fs.doc(db, 'categories', slugify(name)), { name, createdAt: now + index });
  });
  defaults.albums.forEach((album, index) => {
    batch.set(fs.doc(db, 'albums', album.id), {
      category: album.category,
      title: album.title,
      description: album.description,
      images: [album.image],
      createdAt: now - index
    });
  });
  getDefaultPackages().forEach((item, index) => {
    batch.set(fs.doc(db, 'packages', item.id), {
      title: item.title,
      price: item.price,
      features: item.features,
      featured: Boolean(item.featured),
      createdAt: now + index
    });
  });
  await batch.commit();
}

function listenForSiteData() {
  if (!firestore || !firestoreModule || stopSiteListeners.length) return;
  const fs = firestoreModule;

  const watch = (name, onData) => {
    stopSiteListeners.push(fs.onSnapshot(fs.collection(firestore, name), (snapshot) => {
      delete siteData.errors[name];
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      renderGalleryPage();
      renderTestimonialPackages();
      renderAdminDashboard({ skipPackages: name !== 'packages' });
    }, (error) => {
      console.error(`Could not load ${name}:`, error);
      siteData.errors[name] = error.message;
      siteData.failed = true;
      renderGalleryPage();
      renderTestimonialPackages();
      renderAdminDashboard();
    }));
  };

  watch('categories', (items) => {
    siteData.categories = items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });
  watch('albums', (items) => {
    siteData.albums = items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  });
  watch('packages', (items) => {
    siteData.packages = items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });
}

/* ---- GALLERY FILTER ---- */
const defaultFilterBtns = document.querySelectorAll('.gf');
const defaultGalItems = document.querySelectorAll('.gal-item');

if (defaultFilterBtns.length) {
  defaultFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      defaultFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-f');
      defaultGalItems.forEach(item => {
        const cat = item.getAttribute('data-cat');
        if (filter === 'all' || cat === filter) {
          item.style.display = '';
          item.style.animation = 'fadeUp 0.4s ease both';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
}

/* ---- LIGHTBOX ---- */
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');

function lb(btn) {
  if (!lbImg || !lightbox) return;
  lbImg.src = btn.getAttribute('data-s');
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLb() {
  if (!lightbox || !lbImg) return;
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { lbImg.src = ''; }, 300);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });

/* ---- TESTIMONIALS SLIDER ---- */
const track = document.getElementById('ttrack');
const dots = document.querySelectorAll('.tdot');
let current = 0;
let autoSlide;

function getVisible() {
  return window.innerWidth < 768 ? 1 : 3;
}

function goTo(index) {
  if (!track) return;
  const cards = track.querySelectorAll('.tcard');
  const visible = getVisible();
  const max = cards.length - visible;
  current = Math.max(0, Math.min(index, max));
  const cardW = cards[0].offsetWidth + 24;
  track.style.transform = `translateX(-${current * cardW}px)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === current));
}

const tprev = document.getElementById('tprev');
const tnext = document.getElementById('tnext');
if (tprev) tprev.addEventListener('click', () => goTo(current - 1));
if (tnext) tnext.addEventListener('click', () => goTo(current + 1));
dots.forEach(d => d.addEventListener('click', () => goTo(parseInt(d.getAttribute('data-i')))));

function startAuto() {
  if (!track) return;
  autoSlide = setInterval(() => {
    const cards = track.querySelectorAll('.tcard');
    const visible = getVisible();
    const max = cards.length - visible;
    goTo(current >= max ? 0 : current + 1);
  }, 4500);
}
if (track) {
  startAuto();
  track.parentElement.addEventListener('mouseenter', () => clearInterval(autoSlide));
  track.parentElement.addEventListener('mouseleave', startAuto);
  window.addEventListener('resize', () => goTo(0));
}

/* ---- FAQ ACCORDION ---- */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ---- CONTACT FORM ---- */
const cform = document.getElementById('cform');
const fsuccess = document.getElementById('fsuccess');

if (cform) {
  cform.addEventListener('submit', e => {
    e.preventDefault();
    const btn = cform.querySelector('button[type="submit"]');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    setTimeout(() => {
      if (fsuccess) fsuccess.style.display = 'block';
      btn.textContent = 'Send Message ✨';
      btn.disabled = false;
      cform.reset();
      setTimeout(() => { if (fsuccess) fsuccess.style.display = 'none'; }, 5000);
    }, 1500);
  });
}

async function persistBooking(data) {
  if (!firestore || !firebaseCurrentUser || !firestoreModule) {
    throw new Error('Please sign in with Google and make sure Firebase Firestore is enabled before booking.');
  }

  const booking = {
    uid: firebaseCurrentUser.uid,
    name: data.name,
    email: data.email,
    phone: data.phone,
    service: data.service,
    date: data.date,
    time: data.time,
    notes: data.notes,
    accountEmail: firebaseCurrentUser.email,
    createdAt: firestoreModule.serverTimestamp()
  };
  await firestoreModule.addDoc(firestoreModule.collection(firestore, 'bookings'), booking);
  const bookings = getBookings();
  bookings.unshift({ ...booking, id: `booking-${Date.now()}`, createdAt: new Date().toISOString() });
  saveBookings(bookings);
}

function updateAuthLinks() {
  const user = getSignedInUser();
  const rootPrefix = /\/pages\//i.test(window.location.pathname) ? '../' : '';
  const isAdminPage = document.body && document.body.getAttribute('data-admin-page') === 'true';
  const isAdmin = user && firebaseClient && user.uid === firebaseClient.adminUid;
  document.querySelectorAll('[data-sign-in-link]').forEach((link) => {
    link.replaceChildren();
    link.classList.toggle('nav-user-link', Boolean(user));
    link.title = user
      ? `${isAdmin ? 'Admin account' : 'Signed in'}. Click to sign out.`
      : 'Sign in to book a session';
    link.setAttribute('aria-label', user ? 'Profile. Click to sign out.' : 'Sign in');
    link.href = user ? '#sign-out' : `${rootPrefix}signin.html${isAdminPage ? '?returnTo=admin.html' : ''}`;

    if (!user) {
      link.textContent = 'Sign In';
      return;
    }

    if (user.photoURL) {
      const avatar = document.createElement('img');
      avatar.className = 'nav-user-avatar';
      avatar.src = user.photoURL;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('error', () => {
        const fallback = createProfileFallback(user);
        avatar.replaceWith(fallback);
      }, { once: true });
      link.append(avatar);
    } else {
      link.append(createProfileFallback(user));
    }
  });
}

function createProfileFallback(user) {
  const namespace = 'http://www.w3.org/2000/svg';
  const fallback = document.createElementNS(namespace, 'svg');
  fallback.setAttribute('class', 'nav-user-avatar nav-user-fallback');
  fallback.setAttribute('viewBox', '0 0 32 32');
  fallback.setAttribute('aria-hidden', 'true');
  const background = document.createElementNS(namespace, 'circle');
  background.setAttribute('cx', '16');
  background.setAttribute('cy', '16');
  background.setAttribute('r', '15');
  const head = document.createElementNS(namespace, 'circle');
  head.setAttribute('cx', '16');
  head.setAttribute('cy', '12');
  head.setAttribute('r', '5');
  const shoulders = document.createElementNS(namespace, 'path');
  shoulders.setAttribute('d', 'M6 28c.8-5.3 4.5-8 10-8s9.2 2.7 10 8');
  fallback.append(background, head, shoulders);
  return fallback;
}

function closeMobileMenu() {
  if (!mobileNav || !burger) return;
  mobileNav.classList.remove('open');
  burger.querySelectorAll('span').forEach((span) => {
    span.style.transform = '';
    span.style.opacity = '';
  });
}

function setAdminMessage(message, isError, showSignIn = false) {
  const status = document.getElementById('adminAccessMessage');
  const grid = document.getElementById('adminDashboard');
  if (status) {
    status.replaceChildren(document.createTextNode(message));
    status.classList.toggle('auth-error', Boolean(isError));
    if (showSignIn) {
      const signInLink = document.createElement('a');
      signInLink.className = 'admin-signin-link';
      signInLink.href = 'signin.html?returnTo=admin.html';
      signInLink.textContent = 'Admin sign in';
      status.append(document.createElement('br'), signInLink);
    }
    status.hidden = !message;
  }
  if (grid) grid.hidden = Boolean(message);
}

function setAdminPanelError(listId, message) {
  const list = document.getElementById(listId);
  if (list) {
    list.textContent = message;
    list.classList.add('auth-error');
  }
}

function stopAdminDataListeners() {
  stopAdminListeners.forEach((unsubscribe) => unsubscribe());
  stopAdminListeners = [];
  firebaseAdminBookings = null;
  firebaseAdminUsers = null;
}

function listenForAdminData() {
  if (!firestore || !firestoreModule || stopAdminListeners.length) return;
  const bookingsQuery = firestoreModule.query(
    firestoreModule.collection(firestore, 'bookings'),
    firestoreModule.orderBy('createdAt', 'desc')
  );
  const usersQuery = firestoreModule.query(
    firestoreModule.collection(firestore, 'users'),
    firestoreModule.orderBy('lastSeenAt', 'desc')
  );

  stopAdminListeners.push(firestoreModule.onSnapshot(bookingsQuery, (snapshot) => {
    firebaseAdminBookings = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    document.getElementById('adminBookingList')?.classList.remove('auth-error');
    renderAdminDashboard({ skipPackages: true });
  }, (error) => {
    setAdminPanelError('adminBookingList', `Could not load bookings: ${error.message}`);
  }));
  stopAdminListeners.push(firestoreModule.onSnapshot(usersQuery, (snapshot) => {
    firebaseAdminUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    document.getElementById('adminUserList')?.classList.remove('auth-error');
    renderAdminDashboard({ skipPackages: true });
  }, (error) => {
    setAdminPanelError('adminUserList', `Could not load sign-in activity: ${error.message}`);
  }));
}

async function handleFirebaseAuthState(user) {
  firebaseCurrentUser = user;
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  updateAuthLinks();
  const isAdminPage = document.body && document.body.getAttribute('data-admin-page') === 'true';
  if (!user) {
    stopAdminDataListeners();
    setAdminMessage(isAdminPage
      ? 'Sign in with the admin email and password to open this dashboard.'
      : '', false, isAdminPage);
    return;
  }

  try {
    await firebaseClient.recordSignedInUser(user, { firestore, firestoreModule });
  } catch (error) {
    if (isAdminPage) {
      setAdminPanelError('adminUserList', `Could not update sign-in activity: ${error.message}`);
    }
  }

  // Keep "last seen" fresh while the person has the site open, so the admin can see who is online.
  presenceTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    firebaseClient.recordSignedInUser(user, { firestore, firestoreModule }).catch(() => {});
  }, 120000);

  const isAdmin = user.uid === firebaseClient.adminUid;
  if (isAdminPage) {
    if (!isAdmin) {
      stopAdminDataListeners();
      setAdminMessage('Access denied. Sign in with the authorized admin account to use the admin panel.', true);
      return;
    }
    setAdminMessage('', false);
    listenForAdminData();
  }
}

async function initializeFirebase() {
  firebaseClient = await import('./firebase-client.js');
  const services = await firebaseClient.getFirebaseServices();
  firebaseApp = services.app;
  firebaseAuth = services.auth;
  firestore = services.firestore;
  firebaseAuthModule = services.authModule;
  firestoreModule = services.firestoreModule;
  listenForSiteData();
  firebaseAuthStateReady = new Promise((resolve) => {
    firebaseAuthModule.onAuthStateChanged(firebaseAuth, (user) => {
      handleFirebaseAuthState(user);
      resolve(user);
    }, (error) => {
      if (document.body && document.body.getAttribute('data-admin-page') === 'true') {
        setAdminMessage(`Firebase sign-in error: ${firebaseClient.getFirebaseAuthErrorMessage(error)}`, true);
      }
      resolve(null);
    });
  });
}

function initializeFirebaseAuthUI() {
  const rootPrefix = /\/pages\//i.test(window.location.pathname) ? '../' : '';
  const desktopNav = document.querySelector('#nav-links');
  const mobileNavList = document.querySelector('#mobile-nav ul');

  [desktopNav, mobileNavList].forEach((navList) => {
    if (!navList) return;
    const authItem = document.createElement('li');
    authItem.innerHTML = `<a href="${rootPrefix}signin.html" class="nav-auth-link${navList === mobileNavList ? ' mob-link' : ''}" data-sign-in-link>Sign In</a>`;
    navList.appendChild(authItem);
  });

  document.querySelectorAll('#mobile-nav .mob-link').forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
  });

  document.querySelectorAll('[data-sign-in-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!getSignedInUser()) return;
      event.preventDefault();
      if (link.classList.contains('mob-link')) closeMobileMenu();
      firebaseAuthModule.signOut(firebaseAuth).catch((error) => {
        if (document.body && document.body.getAttribute('data-admin-page') === 'true') {
          setAdminMessage(`Could not sign out: ${error.message}`, true);
        } else {
          window.alert(`Could not sign out: ${error.message}`);
        }
      });
    });
  });

  updateAuthLinks();
  firebaseReady = initializeFirebase().catch((error) => {
    siteData.failed = true;
    renderGalleryPage();
    renderTestimonialPackages();
    if (document.body && document.body.getAttribute('data-admin-page') === 'true') {
      setAdminMessage(
        firebaseClient
          ? firebaseClient.getFirebaseAuthErrorMessage(error)
          : error.message,
        true
      );
    }
  });
}

window.getSignedInUser = getSignedInUser;
window.firebaseAuthReady = async () => {
  await firebaseReady;
  await firebaseAuthStateReady;
  return getSignedInUser();
};

/* ---- SCROLL REVEAL ---- */
const revealEls = document.querySelectorAll(
  '.svc-card, .feat, .aimg, .cinfo-item, .faq-item, .tcard, .gal-item, .aimg-main, .aimg-sub, .about-info, .sec-head'
);

if (revealEls.length) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animation = 'fadeUp 0.6s ease both';
        e.target.style.opacity = '1';
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.animationDelay = `${(i % 4) * 0.1}s`;
    revealObserver.observe(el);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderGalleryPage();
  renderAdminDashboard();
  initializeFirebaseAuthUI();
  if (typeof renderPackages === 'function') renderPackages();
  if (typeof renderPackageAdmin === 'function') renderPackageAdmin();
  if (typeof renderServiceTestimonials === 'function') renderServiceTestimonials();
  if (typeof renderTestimonialPackages === 'function') renderTestimonialPackages();
});

window.getSignedInUser = getSignedInUser;
window.persistBooking = persistBooking;
