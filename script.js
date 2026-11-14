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
  gallery: 'ars_gallery_state',
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
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.gallery);
    if (!raw) return getDefaultGalleryState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.albums)) {
      return getDefaultGalleryState();
    }
    return {
      categories: parsed.categories,
      albums: parsed.albums.map(normalizeAlbum)
    };
  } catch (error) {
    return getDefaultGalleryState();
  }
}

function saveGalleryState(value) {
  localStorage.setItem(STORAGE_KEYS.gallery, JSON.stringify(value));
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
  try {
    const raw = localStorage.getItem(PACKAGE_STORAGE_KEY);
    if (!raw) return getDefaultPackages();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : getDefaultPackages();
  } catch (error) {
    return getDefaultPackages();
  }
}

function savePackages(packages) {
  localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(packages));
}

function renderGalleryPage() {
  const filters = document.querySelector('.gal-filters');
  const grid = document.getElementById('gal-grid');
  if (!filters || !grid) return;

  const state = getGalleryState();
  const categoryNames = state.categories || [];

  filters.innerHTML = [
    '<button class="gf active" data-f="all">All</button>',
    ...categoryNames.map((category) => `<button class="gf" data-f="${slugify(category)}">${category}</button>`)
  ].join('');

  grid.innerHTML = (state.albums || []).map((album) => {
    const primaryImage = (album.images && album.images[0]) || '';
    return `
      <div class="gal-item" data-cat="${slugify(album.category)}">
        <img src="${primaryImage}" alt="${album.title}" loading="lazy" />
        <div class="gal-ov">
          <h4>${album.title}</h4>
          <p>${album.description}</p>
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

function renderAdminDashboard() {
  const categoryList = document.getElementById('adminCategoryList');
  const albumList = document.getElementById('adminAlbumList');
  const bookingList = document.getElementById('adminBookingList');
  const userList = document.getElementById('adminUserList');
  const categorySelect = document.getElementById('albumCategory');

  if (!categoryList && !albumList && !bookingList && !userList) return;

  const state = getGalleryState();

  if (categoryList) {
    categoryList.innerHTML = state.categories.map((category) => `
      <div class="admin-tag-card">
        <span>${category}</span>
        <button type="button" data-category="${category}" class="mini-delete">Delete</button>
      </div>
    `).join('');

    categoryList.querySelectorAll('.mini-delete').forEach((button) => {
      button.addEventListener('click', () => {
        const category = button.getAttribute('data-category');
        const nextState = {
          categories: state.categories.filter((item) => item !== category),
          albums: (state.albums || []).filter((album) => album.category !== category)
        };
        saveGalleryState(nextState);
        renderAdminDashboard();
        renderGalleryPage();
      });
    });
  }

  if (categorySelect) {
    categorySelect.innerHTML = state.categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  }

  if (albumList) {
    albumList.innerHTML = (state.albums || []).map((album) => {
      const images = album.images && album.images.length ? album.images : [''];
      return `
        <div class="admin-album-item">
          <img src="${images[0]}" alt="${album.title}" />
          <div>
            <strong>${album.title}</strong>
            <p>${album.category}</p>
            <small>${album.description}</small>
          </div>
          <button type="button" data-album-id="${album.id}" class="mini-delete">Remove</button>
        </div>
      `;
    }).join('');

    albumList.querySelectorAll('.mini-delete').forEach((button) => {
      button.addEventListener('click', () => {
        const albumId = button.getAttribute('data-album-id');
        const nextState = {
          categories: state.categories,
          albums: (state.albums || []).filter((album) => album.id !== albumId)
        };
        saveGalleryState(nextState);
        renderAdminDashboard();
        renderGalleryPage();
      });
    });
  }

  if (bookingList) {
    const bookings = firebaseAdminBookings === null ? getBookings() : firebaseAdminBookings;
    if (!bookings.length) {
      bookingList.innerHTML = '<div class="empty-state">No bookings yet.</div>';
    } else {
      bookingList.innerHTML = bookings.map((booking) => `
        <div class="admin-booking-item">
          <div>
            <strong>${escapeHTML(booking.name || 'Guest')}</strong>
            <p>${escapeHTML(booking.email || 'No email')}</p>
            ${booking.phone ? `<small>Phone: ${escapeHTML(booking.phone)}</small>` : ''}
            ${booking.accountEmail ? `<small>Account: ${escapeHTML(booking.accountEmail)}</small>` : ''}
          </div>
          <div>
            <span>${escapeHTML(booking.service || 'Session')}</span>
            <small>${escapeHTML(booking.date || 'No date')} • ${escapeHTML(booking.time || 'No time')}</small>
            ${booking.notes ? `<p>${escapeHTML(booking.notes)}</p>` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  if (userList) {
    const users = firebaseAdminUsers || [];
    if (!users.length) {
      userList.innerHTML = '<div class="empty-state">No signed-in users yet.</div>';
    } else {
      userList.innerHTML = users.map((user) => {
        const lastSeen = user.lastSeenAt && typeof user.lastSeenAt.toDate === 'function'
          ? user.lastSeenAt.toDate()
          : (user.lastSeenAt ? new Date(user.lastSeenAt) : null);
        const lastSeenText = lastSeen && !Number.isNaN(lastSeen.getTime())
          ? lastSeen.toLocaleString()
          : 'Not available';
        return `
          <div class="admin-user-item">
            ${user.photoURL ? `<img src="${escapeHTML(user.photoURL)}" alt="" />` : '<span class="admin-user-avatar" aria-hidden="true">G</span>'}
            <div class="admin-user-details">
              <strong>${escapeHTML(user.displayName || 'Google user')}</strong>
              <p>${escapeHTML(user.email || 'No email')}</p>
            </div>
            <div class="admin-user-last-seen">
              <span>Last seen</span>
              <small>${escapeHTML(lastSeenText)}</small>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function addGalleryCategory(categoryName) {
  const value = categoryName.trim();
  if (!value) return;
  const state = getGalleryState();
  const exists = state.categories.some((item) => item.toLowerCase() === value.toLowerCase());
  if (exists) return;
  state.categories.push(value);
  saveGalleryState(state);
  renderAdminDashboard();
  renderGalleryPage();
}

function addGalleryAlbum(payload) {
  if (!payload.category || !payload.title) return;
  const state = getGalleryState();
  const images = payload.images && payload.images.length ? payload.images : (payload.image ? [payload.image] : []);
  if (!images.length) return;

  state.albums.push({
    id: `album-${Date.now()}`,
    category: payload.category,
    title: payload.title,
    description: payload.description || 'New album shot',
    images
  });
  saveGalleryState(state);
  renderAdminDashboard();
  renderGalleryPage();
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
  document.querySelectorAll('[data-sign-in-link]').forEach((link) => {
    link.replaceChildren();
    link.classList.toggle('nav-user-link', Boolean(user));
    link.title = user ? `Signed in as ${user.email}. Click to sign out.` : 'Sign in to book a session';
    link.setAttribute('aria-label', user ? `Signed in as ${user.email}. Click to sign out.` : 'Sign in');
    link.href = user ? '#sign-out' : `${rootPrefix}signin.html${isAdminPage ? '?returnTo=admin.html' : ''}`;

    if (!user) {
      link.textContent = 'Sign In';
      return;
    }

    const avatar = document.createElement(user.photoURL ? 'img' : 'span');
    avatar.className = 'nav-user-avatar';
    if (user.photoURL) {
      avatar.src = user.photoURL;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      avatar.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'nav-user-avatar nav-user-initial';
        fallback.textContent = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
        avatar.replaceWith(fallback);
      }, { once: true });
    } else {
      avatar.classList.add('nav-user-initial');
      avatar.textContent = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
    }

    const email = document.createElement('span');
    email.className = 'nav-user-email';
    email.textContent = user.email || user.displayName || 'Signed in';
    link.append(avatar, email);
  });
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
      signInLink.textContent = 'Sign in with Google';
      status.append(document.createElement('br'), signInLink);
    }
    status.hidden = !message;
  }
  if (grid) grid.hidden = Boolean(message);
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
    renderAdminDashboard();
  }, (error) => {
    setAdminMessage(`Could not load bookings: ${error.message}`, true);
  }));
  stopAdminListeners.push(firestoreModule.onSnapshot(usersQuery, (snapshot) => {
    firebaseAdminUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAdminDashboard();
  }, (error) => {
    setAdminMessage(`Could not load sign-in activity: ${error.message}`, true);
  }));
}

async function handleFirebaseAuthState(user) {
  firebaseCurrentUser = user;
  updateAuthLinks();
  const isAdminPage = document.body && document.body.getAttribute('data-admin-page') === 'true';
  if (!user) {
    stopAdminDataListeners();
    setAdminMessage(isAdminPage
      ? 'Sign in with the admin Google account to open this dashboard.'
      : '', false, isAdminPage);
    return;
  }

  try {
    await firebaseClient.recordSignedInUser(user, { firestore, firestoreModule });
  } catch (error) {
    if (isAdminPage) setAdminMessage(`Could not update sign-in activity: ${error.message}`, true);
  }

  const isAdmin = user.email && user.email.toLowerCase() === firebaseClient.adminEmail;
  if (isAdminPage) {
    if (!isAdmin) {
      stopAdminDataListeners();
      setAdminMessage(`Access denied. Sign in with ${firebaseClient.adminEmail} to use the admin panel.`, true);
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
  firebaseAuthStateReady = new Promise((resolve) => {
    firebaseAuthModule.onAuthStateChanged(firebaseAuth, (user) => {
      handleFirebaseAuthState(user);
      resolve(user);
    }, (error) => {
      if (document.body && document.body.getAttribute('data-admin-page') === 'true') {
        setAdminMessage(`Firebase sign-in error: ${error.message}`, true);
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
    if (document.body && document.body.getAttribute('data-admin-page') === 'true') {
      setAdminMessage(error.message, true);
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
