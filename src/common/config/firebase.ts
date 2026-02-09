import admin from "firebase-admin";

let firestore: admin.firestore.Firestore;

export function initializeFirebase(): void {
  if (!admin.apps.length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: "demo-local" });
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }

  firestore = admin.firestore();
}

export function getFirestore(): admin.firestore.Firestore {
  if (!firestore) {
    throw new Error("Firestore not initialized");
  }
  return firestore;
}
