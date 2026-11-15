import {
  adminUid,
  checkIsAdmin,
  getFirebaseAuthErrorMessage,
  getFirebaseServices,
  recordSignedInUser
} from './firebase-client.js';

// DOM Elements
const authForm = document.getElementById('clientAuthForm');
const nameGroup = document.getElementById('nameGroup');
const nameInput = document.getElementById('sfName');
const emailInput = document.getElementById('sfEmail');
const passwordInput = document.getElementById('sfPassword');
const eyeBtn = document.getElementById('sfEye');
const submitBtn = document.getElementById('clientSubmitBtn');
const switchModeBtn = document.getElementById('switchModeBtn');
const switchPrompt = document.getElementById('switchPrompt');
const clientTitle = document.getElementById('clientTitle');
const clientSubtitle = document.getElementById('clientSubtitle');
const clientMsg = document.getElementById('clientMsg');
const clientGoogleBtn = document.getElementById('clientGoogleBtn');

const adminGoogleBtn = document.getElementById('adminGoogleBtn');
const adminMsg = document.getElementById('adminMsg');

let services;
let redirecting = false;
let rejecting = false;
let isSignUpMode = false; // false = Sign In, true = Sign Up
let authIntent = 'client'; // 'client' or 'admin'

// Switch between Client Sign In and Client Sign Up modes
function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  nameGroup.style.display = isSignUpMode ? 'block' : 'none';
  if (isSignUpMode) {
    clientTitle.innerHTML = 'Create an <em>Account</em>';
    clientSubtitle.textContent = 'Register with your email to start booking photography sessions.';
    submitBtn.textContent = 'Create Account';
    switchPrompt.textContent = 'Already have an account?';
    switchModeBtn.textContent = 'Sign In';
  } else {
    clientTitle.innerHTML = 'Client <em>Sign In</em>';
    clientSubtitle.textContent = 'Sign in or create an account to book your photography session.';
    submitBtn.textContent = 'Sign In';
    switchPrompt.textContent = "Don't have an account?";
    switchModeBtn.textContent = 'Create an account';
  }
  showMsg(clientMsg, '', false);
}

if (switchModeBtn) {
  switchModeBtn.addEventListener('click', toggleAuthMode);
}

// Password toggle eye
if (eyeBtn && passwordInput) {
  eyeBtn.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type = isText ? 'password' : 'text';
    eyeBtn.textContent = isText ? '👁' : '🙈';
    eyeBtn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  });
}

// Show feedback message in a target element
function showMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'signin-msg' + (text ? ` show ${isError ? 'err' : 'ok'}` : '');
}

// Parse error codes for friendly messages
function getFriendlyErrorMessage(error) {
  if (!error) return 'Authentication failed. Please try again.';

  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password is too short. Please choose a password with at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact ARS Gallery.';
    case 'auth/too-many-requests':
      return 'Access temporarily paused due to multiple failed attempts. Please wait a moment and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Please enable popups for this site and retry.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was canceled before completion.';
    default:
      return getFirebaseAuthErrorMessage(error);
  }
}

// Determine redirect destination
function getRedirectTarget(user, isAdmin) {
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo');

  if (isAdmin) {
    return new URL(returnTo || 'admin.html', location.href).href;
  }

  if (returnTo && !returnTo.toLowerCase().includes('admin.html')) {
    return new URL(returnTo, location.href).href;
  }

  return new URL('index.html', location.href).href;
}

// Save any appointment picked before signing in
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
    name: booking.name || user.displayName || user.email?.split('@')[0] || 'Client',
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

// Sign out unauthorized user
async function rejectUnauthorized(targetMsgEl, reason) {
  rejecting = true;
  try {
    if (services && services.auth) {
      await services.authModule.signOut(services.auth);
    }
  } finally {
    rejecting = false;
    authIntent = 'client';
    if (submitBtn) submitBtn.disabled = false;
    if (clientGoogleBtn) clientGoogleBtn.disabled = false;
    if (adminGoogleBtn) adminGoogleBtn.disabled = false;
    showMsg(targetMsgEl, reason, true);
  }
}

// Complete successful sign-in
async function finishSignIn(user) {
  if (redirecting || rejecting) return;

  const isAdmin = await checkIsAdmin(user, services);

  // If clicked explicitly on the Admin button but NOT authorized as an admin
  if (authIntent === 'admin' && !isAdmin) {
    await rejectUnauthorized(
      adminMsg,
      `Access Denied: Your Google account (${user.email || user.uid}) is not authorized as an Admin. Only approved administrators can access the Admin Dashboard.`
    );
    return;
  }

  redirecting = true;
  if (submitBtn) submitBtn.disabled = true;
  if (clientGoogleBtn) clientGoogleBtn.disabled = true;
  if (adminGoogleBtn) adminGoogleBtn.disabled = true;

  const targetMsg = (authIntent === 'admin' && isAdmin) ? adminMsg : clientMsg;
  showMsg(targetMsg, 'Signing in...', false);

  try {
    // Record user activity in Firestore
    await recordSignedInUser(user, services).catch((err) => {
      console.warn('Could not record user activity:', err);
    });

    // Save pending booking if any
    await savePendingBooking(user);
  } catch (error) {
    showMsg(targetMsg, `Signed in, but pending booking could not be saved: ${error.message}`, true);
    redirecting = false;
    if (submitBtn) submitBtn.disabled = false;
    if (clientGoogleBtn) clientGoogleBtn.disabled = false;
    if (adminGoogleBtn) adminGoogleBtn.disabled = false;
    return;
  }

  showMsg(targetMsg, 'Success! Redirecting...', false);
  setTimeout(() => {
    location.replace(getRedirectTarget(user, isAdmin && authIntent === 'admin'));
  }, 400);
}

// Handle Client Form (Sign In OR Sign Up)
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authIntent = 'client';
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput?.value.trim() || '';

    if (!email || !password) {
      showMsg(clientMsg, 'Please enter both your email and password.', true);
      return;
    }

    if (isSignUpMode && password.length < 6) {
      showMsg(clientMsg, 'Password must be at least 6 characters long.', true);
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = `<span class="sf-spinner"></span> ${isSignUpMode ? 'Creating account...' : 'Signing in...'}`;
    showMsg(clientMsg, '', false);

    try {
      services = await getFirebaseServices();

      if (isSignUpMode) {
        // Register new user
        const userCredential = await services.authModule.createUserWithEmailAndPassword(
          services.auth,
          email,
          password
        );
        // Set display name if provided
        if (name && userCredential.user) {
          try {
            await services.authModule.updateProfile(userCredential.user, { displayName: name });
          } catch (profileErr) {
            console.warn('Could not set displayName:', profileErr);
          }
        }
      } else {
        // Sign in existing user
        await services.authModule.signInWithEmailAndPassword(services.auth, email, password);
      }
      // Auth state listener handles completion
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      showMsg(clientMsg, getFriendlyErrorMessage(error), true);
    }
  });
}

// Handle Client Google Sign-in
if (clientGoogleBtn) {
  clientGoogleBtn.addEventListener('click', async () => {
    authIntent = 'client';
    clientGoogleBtn.disabled = true;
    const originalHtml = clientGoogleBtn.innerHTML;
    clientGoogleBtn.innerHTML = '<span class="sf-spinner"></span> Connecting to Google...';
    showMsg(clientMsg, '', false);

    try {
      services = await getFirebaseServices();
      const provider = new services.authModule.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await services.authModule.signInWithPopup(services.auth, provider);
      // finishSignIn handles completion
    } catch (error) {
      clientGoogleBtn.disabled = false;
      clientGoogleBtn.innerHTML = originalHtml;
      showMsg(clientMsg, getFriendlyErrorMessage(error), true);
    }
  });
}

// Handle Admin Google Sign-in
if (adminGoogleBtn) {
  adminGoogleBtn.addEventListener('click', async () => {
    authIntent = 'admin';
    adminGoogleBtn.disabled = true;
    const originalHtml = adminGoogleBtn.innerHTML;
    adminGoogleBtn.innerHTML = '<span class="sf-spinner"></span> Connecting to Google...';
    showMsg(adminMsg, '', false);

    try {
      services = await getFirebaseServices();
      const provider = new services.authModule.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await services.authModule.signInWithPopup(services.auth, provider);
      // finishSignIn handles the admin authorization check
    } catch (error) {
      adminGoogleBtn.disabled = false;
      adminGoogleBtn.innerHTML = originalHtml;
      showMsg(adminMsg, getFriendlyErrorMessage(error), true);
    }
  });
}

// Initialize Firebase
async function initializeSignIn() {
  try {
    services = await getFirebaseServices();

    services.authModule.onAuthStateChanged(services.auth, (user) => {
      if (user) {
        finishSignIn(user);
      }
    }, (error) => {
      showMsg(clientMsg, `Firebase sign-in error: ${getFriendlyErrorMessage(error)}`, true);
    });
  } catch (error) {
    showMsg(clientMsg, getFriendlyErrorMessage(error), true);
    if (submitBtn) submitBtn.disabled = true;
    if (clientGoogleBtn) clientGoogleBtn.disabled = true;
    if (adminGoogleBtn) adminGoogleBtn.disabled = true;
  }
}

initializeSignIn();
