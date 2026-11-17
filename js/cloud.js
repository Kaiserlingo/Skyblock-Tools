/* =========================================================
   Cloud-Anbindung (Firebase Authentication + Cloud Firestore)

   Stellt window.Cloud bereit. Ist js/firebase-config.js leer,
   bleibt Cloud.enabled = false und die Seite läuft im Gastmodus.

   Gespeichert wird pro Person ein Dokument:  users/{uid}
   { settings, watch, alerts, sort, updatedAt }
   Zugriff regeln die Security Rules in firestore.rules.
   ========================================================= */
const V = '12.19.0';
const cfg = window.FIREBASE_CONFIG || {};

function ready(){ window.dispatchEvent(new Event('cloud-ready')); }

if (!cfg.apiKey){
  window.Cloud = {enabled: false};
  ready();
} else {
  try{
    const [{initializeApp}, A, F] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app);
    const db = F.getFirestore(app);
    auth.languageCode = 'de';
    let unsub = null;
    const ref = () => F.doc(db, 'users', auth.currentUser.uid);

    window.Cloud = {
      enabled: true,
      signInGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
      signIn: (mail, pw) => A.signInWithEmailAndPassword(auth, mail, pw),
      async register(mail, pw, name){
        const c = await A.createUserWithEmailAndPassword(auth, mail, pw);
        if (name) await A.updateProfile(c.user, {displayName: name});
        return c;
      },
      reset: mail => A.sendPasswordResetEmail(auth, mail),
      signOut: () => { if (unsub){ unsub(); unsub = null; } return A.signOut(auth); },
      async load(){
        const snap = await F.getDoc(ref());
        return snap.exists() ? snap.data() : null;
      },
      save(data){
        // JSON-Runde entfernt undefined/Infinity, die Firestore nicht speichern kann
        const clean = JSON.parse(JSON.stringify(data));
        return F.setDoc(ref(), {...clean, updatedAt: F.serverTimestamp()});
      },
      watch(cb){
        if (unsub) unsub();
        unsub = F.onSnapshot(ref(), snap => {
          if (snap.metadata.hasPendingWrites) return;   // eigenes, noch nicht bestätigtes Schreiben
          cb(snap.exists() ? snap.data() : null);
        }, err => console.warn('Cloud-Sync', err));
      },
    };
    A.onAuthStateChanged(auth, user => {
      if (!user && unsub){ unsub(); unsub = null; }
      window.dispatchEvent(new CustomEvent('cloud-auth', {detail: user}));
    });
  }catch(e){
    console.warn('Firebase konnte nicht geladen werden – Gastmodus.', e);
    window.Cloud = {enabled: false};
  }
  ready();
}
