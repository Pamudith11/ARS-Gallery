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
export const adminEmail = 'pamudith11@gmail.com';

let firebaseServices;

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
