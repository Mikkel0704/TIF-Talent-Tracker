// En efterligning af de Firebase-moduler, index.html henter. Den holder data i
// hukommelsen (window.__db), svarer paa lyttere og husker hver skrivning i
// window.__skrivninger, saa en test kan starte HELE appen uden netvaerk og se, hvad den
// goer. Den haandhaever ingen regler - dem tester tests/regler mod den rigtige emulator.
const db = () => (window.__db ||= {});
const lyttere = new Set();
const SLET = { __slet: true };
const tid = () => { const d = new Date(); return { seconds: Math.floor(d/1000), nanoseconds: 0, toDate: () => d }; };

function flet(maal, kilde){
  for (const [k, v] of Object.entries(kilde)) {
    if (v === SLET) delete maal[k];
    else if (v && typeof v === "object" && !Array.isArray(v) && !v.toDate) {
      if (!maal[k] || typeof maal[k] !== "object" || Array.isArray(maal[k])) maal[k] = {};
      flet(maal[k], v);
    } else maal[k] = v;
  }
  return maal;
}
const rens = v => (v === SLET ? undefined : v && typeof v === "object" && !Array.isArray(v) && !v.toDate
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== SLET).map(([k, x]) => [k, rens(x)])) : v);
const kopi = x => JSON.parse(JSON.stringify(x, (k, v) => (v && v.toDate ? { __tid: v.seconds } : v)),
  (k, v) => (v && v.__tid !== undefined ? { seconds: v.__tid, nanoseconds: 0, toDate: () => new Date(v.__tid * 1000) } : v));

const docSnap = (navn, id) => { const d = db()[navn]?.[id];
  return { id, ref: { kind: "doc", navn, id }, exists: () => d !== undefined, data: () => (d === undefined ? undefined : kopi(d)) }; };
function colSnap(maal){
  const alle = Object.keys(db()[maal.navn] || {}).map(id => docSnap(maal.navn, id));
  const docs = alle.filter(s => (maal.filtre || []).every(([felt, op, v]) => op === "==" ? s.data()[felt] === v : true));
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
}
const snap = maal => (maal.kind === "doc" ? docSnap(maal.navn, maal.id) : colSnap(maal));
function giv(navn){ lyttere.forEach(l => { if (l.maal.navn === navn) setTimeout(() => lyttere.has(l) && l.cb(snap(l.maal)), 0); }); }

export const initializeApp = () => ({});
export const initializeAppCheck = () => ({});
export class ReCaptchaEnterpriseProvider { constructor(){ } }
export const getAuth = () => ({ get currentUser(){ return window.__bruger || null; } });
export const onAuthStateChanged = (auth, cb) => { setTimeout(() => cb(window.__bruger || null), 0); return () => {}; };
export const signOut = async () => { window.__bruger = null; };
export const signInWithEmailAndPassword = async () => ({ user: window.__bruger });
export const createUserWithEmailAndPassword = async () => ({ user: { uid: "ny-bruger" } });
export const updatePassword = async () => {};
export const sendPasswordResetEmail = async () => {};

export const getFirestore = () => ({});
export const collection = (d, navn) => ({ kind: "col", navn });
export const doc = (d, navn, id) => ({ kind: "doc", navn, id });
export const where = (felt, op, v) => [felt, op, v];
export const query = (col, ...filtre) => ({ kind: "col", navn: col.navn, filtre });
export const serverTimestamp = () => tid();
export const deleteField = () => SLET;
export const getDoc = async ref => docSnap(ref.navn, ref.id);
export const getDocs = async maal => colSnap(maal);
export async function setDoc(ref, data, valg){
  (window.__skrivninger ||= []).push({ type: "set", navn: ref.navn, id: ref.id, data: rens(data), merge: !!valg?.merge });
  const col = (db()[ref.navn] ||= {});
  if (valg?.merge) col[ref.id] = flet(col[ref.id] || {}, data); else col[ref.id] = rens(data);
  giv(ref.navn);
}
export async function addDoc(col, data){
  const id = "auto" + Math.random().toString(36).slice(2, 9);
  await setDoc({ navn: col.navn, id }, data);
  return { id };
}
export async function deleteDoc(ref){
  (window.__skrivninger ||= []).push({ type: "delete", navn: ref.navn, id: ref.id });
  if (db()[ref.navn]) delete db()[ref.navn][ref.id];
  giv(ref.navn);
}
export function onSnapshot(maal, cb){
  const l = { maal, cb }; lyttere.add(l);
  setTimeout(() => lyttere.has(l) && cb(snap(maal)), 0);
  return () => lyttere.delete(l);
}

export const getStorage = () => ({});
export const ref = (s, sti) => ({ sti, name: String(sti).split("/").pop() });
export const uploadBytes = async r => { (window.__skrivninger ||= []).push({ type: "upload", sti: r.sti }); };
export const getDownloadURL = async r => "https://eksempel.invalid/" + r.sti;
export const deleteObject = async r => { (window.__skrivninger ||= []).push({ type: "sletfil", sti: r.sti }); };
export const listAll = async () => ({ items: [] });
