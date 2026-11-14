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

async function finishSignIn(user) {
  if (redirecting) return;
  redirecting = true;
  button.disabled = true;
  try {
    await recordSignedInUser(user, services);
    location.replace(redirectTarget);
  } catch (error) {
    redirecting = false;
    button.disabled = false;
    showMessage(`Signed in, but login activity could not be saved: ${error.message}`, true);
  }
}

async function initializeSignIn() {
  try {
    services = await getFirebaseServices();
    services.authModule.onAuthStateChanged(services.auth, (user) => {
      if (user) finishSignIn(user);
    }, (error) => {
      showMessage(`Firebase sign-in error: ${error.message}`, true);
    });
  } catch (error) {
    showMessage(error.message, true);
    button.disabled = true;
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  showMessage('Opening Google sign-in...', false);
  try {
    if (!services) services = await getFirebaseServices();
    const provider = new services.authModule.GoogleAuthProvider();
    const result = await services.authModule.signInWithPopup(services.auth, provider);
    await finishSignIn(result.user);
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, true);
  }
});

initializeSignIn();
