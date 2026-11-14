import { getFirebaseServices, recordSignedInUser } from './firebase-client.js';

const button = document.getElementById('googleSignInButton');
const message = document.getElementById('authMessage');
const params = new URLSearchParams(location.search);
const redirectTarget = getRedirectTarget(params.get('returnTo'));
let services;
let redirecting = false;

function getRedirectTarget(value) {
  if (!value) return new URL('index.html', location.href).href;
  try {
    const target = new URL(value, location.href);
    if (target.origin !== location.origin || target.pathname.endsWith('/signin.html')) {
      return new URL('index.html', location.href).href;
    }
    return target.href;
  } catch (error) {
    return new URL('index.html', location.href).href;
  }
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
  location.replace(redirectTarget);
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

async function handleGoogleSignIn() {
  button.disabled = true;
  showMessage('Opening Google sign-in...', false);
  try {
    if (!services) services = await getFirebaseServices();
    const provider = new services.authModule.GoogleAuthProvider();
    const result = await services.authModule.signInWithPopup(services.auth, provider);
    await finishSignIn(result.user);
  } catch (error) {
    button.disabled = false;
    showMessage(getSignInErrorMessage(error), true);
  }
}

button.addEventListener('click', handleGoogleSignIn);

initializeSignIn();
