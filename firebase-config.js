// Configurazione Firebase - collega il sito al tuo progetto fantacalcio-manager-22
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFJbwq5EUv8IyQ86J_rbpXnbeX_Uz4R-Q",
  authDomain: "fantacalcio-manager-22.firebaseapp.com",
  projectId: "fantacalcio-manager-22",
  storageBucket: "fantacalcio-manager-22.firebasestorage.app",
  messagingSenderId: "945841171972",
  appId: "1:945841171972:web:0b312b494e119fd1130f51"
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

// Il nostro intero "stato" (listone, rose, voti...) vive in un unico documento:
// collezione "fantacalcio" -> documento "state"
const stateRef = doc(db, "fantacalcio", "state");

export async function loadStateFromCloud(){
  const snap = await getDoc(stateRef);
  if(snap.exists()) return snap.data();
  return null;
}

export async function saveStateToCloud(state){
  await setDoc(stateRef, state);
}
