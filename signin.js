import {
  adminUid,
  getFirebaseAuthErrorMessage,
  getFirebaseServices,
  recordSignedInUser
} from './firebase-client.js';

const button = document.getElementById('googleSignInButton');
const message = document.getElementById('authMessage');
let services;
let redirecting = false;
let rejecting = false;

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

async function rejectSignIn(text) {
  rejecting = true;
  try {
    await services.authModule.signOut(services.auth);
  } finally {
    rejecting = false;
    button.disabled = false;
    showMessage(text, true);
  }
}

async function finishSignIn(user) {
  if (redirecting || rejecting) return;
  const hasGoogle = user.providerData.some((provider) => provider.providerId === 'google.com');

  if (!hasGoogle) {
    await rejectSignIn('Please sign in with your Google account.');
    return;
  }

  redirecting = true;
  button.disabled = true;
  showMessage('', false);
  recordSignedInUser(user, services).catch((error) => {
    console.error('Could not update signed-in user activity:', error);
  });
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
    }));
}

function runSignIn(signIn) {
  button.disabled = true;
  showMessage('', false);
  Promise.resolve()
    .then(signIn)
    .catch((error) => {
      button.disabled = false;
      showMessage(getSignInErrorMessage(error), true);
    });
}

button.addEventListener('click', handleGoogleSignIn);
window.handleGoogleSignIn = handleGoogleSignIn;

initializeSignIn();