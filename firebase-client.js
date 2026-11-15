const firebaseConfig = {
  apiKey: 'AIzaSyA9v_MxMcfPwCjV0uieu6816Ptt_0_9C6k',
  authDomain: 'ars-gallery-9ea0e.firebaseapp.com',
  projectId: 'ars-gallery-9ea0e',
  storageBucket: 'ars-gallery-9ea0e.firebasestorage.app',
  messagingSenderId: '939333410954',
  appId: '1:939333410954:web:451314291ba35822d58d73',
  measurementId: 'G-ZTE8Z9Z3EY'
};

const firebaseVersion = '11.10.0';
export const adminUid = 'ZVtWb2w79UdZy4FjiUY59PTNI6A3';

let firebaseServices;

export function getFirebaseAuthErrorMessage(error) {
  if (error.code === 'auth/api-key-not-valid' || error.code === 'auth/invalid-api-key') {
    return 'The Firebase Web API key in firebase-client.js is invalid. Copy the current web app config from Firebase Console > Project settings > General > Your apps and replace the config.';
  }
  if (error.code === 'auth/configuration-not-found') {
    return 'Firebase could not find this app’s Authentication configuration. Confirm the web app config in firebase-client.js belongs to ars-gallery-9ea0e, then check Firebase Console > Authentication and enable Google sign-in.';
  }
  if (error.code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is disabled. Enable Email/Password or Google under Firebase Console > Authentication > Sign-in method.';
  }
  if (error.code === 'auth/unauthorized-domain') {
    return `Add "${location.hostname}" to Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  return error.message || 'Firebase sign-in failed. Please try again.';
}

export async function getFirebaseServices() {
  if (firebaseServices) return firebaseServices;

  if (location.protocol === 'file:') {
    throw new Error('Google sign-in requires localhost or an HTTPS website; open this project through a web server.');
  }

  const moduleUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import(`${moduleUrl}/firebase-app.js`),
    import(`${moduleUrl}/firebase-auth.js`),
    import(`${moduleUrl}/firebase-firestore.js`)
  ]);
  const app = appModule.getApps().length
    ? appModule.getApp()
    : appModule.initializeApp(firebaseConfig);

  firebaseServices = {
    app,
    auth: authModule.getAuth(app),
    firestore: firestoreModule.getFirestore(app),
    authModule,
    firestoreModule
  };
  return firebaseServices;
}

export async function recordSignedInUser(user, services) {
  const { firestore, firestoreModule } = services;
  await firestoreModule.setDoc(firestoreModule.doc(firestore, 'users', user.uid), {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    lastSeenAt: firestoreModule.serverTimestamp()
  }, { merge: true });
}

export async function checkIsAdmin(user, services) {
  if (!user) return false;
  if (user.uid === adminUid) return true;
  try {
    const { firestore, firestoreModule } = services || (await getFirebaseServices());
    if (user.uid) {
      const docSnap = await firestoreModule.getDoc(firestoreModule.doc(firestore, 'admins', user.uid));
      if (docSnap.exists()) return true;
    }
    if (user.email) {
      const emailDoc = await firestoreModule.getDoc(firestoreModule.doc(firestore, 'admins', user.email.toLowerCase().trim()));
      if (emailDoc.exists()) return true;
    }
  } catch (err) {
    console.warn('Could not verify admin status in Firestore:', err);
  }
  return false;
}
