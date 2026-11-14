import {
  adminUid,
  getFirebaseAuthErrorMessage,
  getFirebaseServices,
  recordSignedInUser
} from './firebase-client.js';

const button = document.getElementById('googleSignInButton');
const message = document.getElementById('authMessage');
const userSignInForm = document.getElementById('userSignInForm');
const adminSignInForm = document.getElementById('adminSignInForm');
const adminSignInSection = document.getElementById('adminSignInSection');
const adminSignInToggle = document.getElementById('toggleAdminSignIn');
let services;
let redirecting = false;

function getRedirectTarget(user) {
  const page = user.uid === adminUid ? 'admin.html' : 'index.html';
  return new URL(page, location.href).href;
}

function showMessage(text, isError) {
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle('auth-error', Boolean(isError));
}

function getSignInErrorMessage(error) {
  if (error.code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
  }
  if (error.code === 'auth/popup-closed-by-user') {
    return 'The Google sign-in window was closed before sign-in completed.';
  }
  if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
    return 'Email or password is incorrect.';
  }
  if (error.code === 'auth/weak-password') {
    return 'The password must contain at least 6 characters.';
  }
  return getFirebaseAuthErrorMessage(error);
}

async function savePendingBooking(user) {
  const rawBooking = sessionStorage.getItem('ars_pending_booking');
  if (!rawBooking) return;

  let booking;
  try {
    booking = JSON.parse(rawBooking);
  } catch (error) {
    sessionStorage.removeItem('ars_pending_booking');
    throw new Error('Your saved booking details could not be read. Please submit the booking again.');
  }
  if (!booking || typeof booking !== 'object') {
    sessionStorage.removeItem('ars_pending_booking');
    throw new Error('Your saved booking details are invalid. Please submit the booking again.');
  }

  const { firestore, firestoreModule } = services;
  await firestoreModule.addDoc(firestoreModule.collection(firestore, 'bookings'), {
    uid: user.uid,
    name: booking.name || user.displayName || '',
    email: booking.email || user.email || '',
    phone: booking.phone || '',
    service: booking.service || '',
    date: booking.date || '',
    time: booking.time || '',
    notes: booking.notes || '',
    accountEmail: user.email || '',
    createdAt: firestoreModule.serverTimestamp()
  });
  sessionStorage.removeItem('ars_pending_booking');
}

async function finishSignIn(user) {
  if (redirecting) return;
  if (user.uid === adminUid && !user.emailVerified) {
    showMessage('Verify the admin email address in Firebase Authentication before opening the dashboard.', true);
    document.querySelectorAll('.signin-card button').forEach((control) => { control.disabled = false; });
    return;
  }
  redirecting = true;
  button.disabled = true;
  showMessage('', false);
  try {
    await recordSignedInUser(user, services);
  } catch (error) {
    showMessage(`Signed in successfully, but last-seen activity could not be saved: ${error.message}`, true);
    await new Promise((resolve) => setTimeout(resolve, 2200));
  }
  try {
    await savePendingBooking(user);
  } catch (error) {
    showMessage(`Signed in, but your booking could not be saved: ${error.message}`, true);
    redirecting = false;
    document.querySelectorAll('.signin-card button').forEach((control) => { control.disabled = false; });
    return;
  }
  location.replace(getRedirectTarget(user));
}

async function initializeSignIn() {
  try {
    services = await getFirebaseServices();
    services.authModule.onAuthStateChanged(services.auth, (user) => {
      if (user) finishSignIn(user);
    }, (error) => {
      showMessage(`Firebase sign-in error: ${getSignInErrorMessage(error)}`, true);
    });
  } catch (error) {
    showMessage(getSignInErrorMessage(error), true);
    button.disabled = true;
  }
}

function handleGoogleSignIn() {
  runSignIn(() => getFirebaseServices()
    .then((firebaseServices) => {
      services = firebaseServices;
      const provider = new services.authModule.GoogleAuthProvider();
      return services.authModule.signInWithPopup(services.auth, provider);
    })
    .then(async (result) => {
      const user = result.user;
      if (!user) throw new Error('Google sign-in completed without returning a user.');
      await finishSignIn(user);
    }));
}

function runSignIn(signIn) {
  const controls = [button, ...userSignInForm.querySelectorAll('button'), ...adminSignInForm.querySelectorAll('button')];
  controls.forEach((control) => { control.disabled = true; });
  showMessage('', false);
  Promise.resolve()
    .then(signIn)
    .catch((error) => {
      controls.forEach((control) => { control.disabled = false; });
      showMessage(getSignInErrorMessage(error), true);
    });
}

userSignInForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('userEmail').value.trim();
  const password = document.getElementById('userPassword').value;
  runSignIn(async () => {
    services = await getFirebaseServices();
    await services.authModule.signInWithEmailAndPassword(services.auth, email, password);
  });
});

adminSignInForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  runSignIn(async () => {
    services = await getFirebaseServices();
    await services.authModule.signInWithEmailAndPassword(services.auth, email, password);
  });
});

adminSignInToggle.addEventListener('click', () => {
  const isExpanded = adminSignInToggle.getAttribute('aria-expanded') === 'true';
  adminSignInToggle.setAttribute('aria-expanded', String(!isExpanded));
  adminSignInSection.hidden = isExpanded;
  adminSignInToggle.textContent = isExpanded ? 'Admin Sign In' : 'Hide Admin Sign In';
  if (!isExpanded) document.getElementById('adminEmail').focus();
});

button.addEventListener('click', handleGoogleSignIn);
window.handleGoogleSignIn = handleGoogleSignIn;

initializeSignIn();
