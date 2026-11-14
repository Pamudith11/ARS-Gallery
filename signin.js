import { adminEmail, getFirebaseServices, recordSignedInUser } from './firebase-client.js';

const button = document.getElementById('googleSignInButton');
const message = document.getElementById('authMessage');
let services;
let redirecting = false;

function getRedirectTarget(user) {
  const page = user.email && user.email.toLowerCase() === adminEmail ? 'admin.html' : 'index.html';
  return new URL(page, location.href).href;
}

function showMessage(text, isError) {
  message.textContent = text;
  message.classList.toggle('auth-error', Boolean(isError));
}

function getSignInErrorMessage(error) {
  if (error.code === 'auth/unauthorized-domain') {
    return `Add "${location.hostname}" to Firebase Console > Authentication > Settings > Authorized domains, then try again.`;
  }
  if (error.code === 'auth/operation-not-allowed') {
    return 'Enable Google as a sign-in provider in Firebase Console > Authentication > Sign-in method.';
  }
  if (error.code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
  }
  if (error.code === 'auth/popup-closed-by-user') {
    return 'The Google sign-in window was closed before sign-in completed.';
  }
  return error.message || 'Google sign-in failed. Please try again.';
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
  redirecting = true;
  button.disabled = true;
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
    button.disabled = false;
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
  button.disabled = true;
  showMessage('Opening Google sign-in...', false);
  getFirebaseServices()
    .then((firebaseServices) => {
      services = firebaseServices;
      const provider = new services.authModule.GoogleAuthProvider();
      return services.authModule.signInWithPopup(services.auth, provider);
    })
    .then(async (result) => {
      const credential = services.authModule.GoogleAuthProvider.credentialFromResult(result);
      const token = credential ? credential.accessToken : null;
      const user = result.user;
      if (!user) throw new Error('Google sign-in completed without returning a user.');
      await finishSignIn(user);
      return token;
    })
    .catch((error) => {
      button.disabled = false;
      showMessage(getSignInErrorMessage(error), true);
    });
}

button.addEventListener('click', handleGoogleSignIn);
window.handleGoogleSignIn = handleGoogleSignIn;

initializeSignIn();
