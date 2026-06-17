import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore as getAdminFirestore } from "firebase-admin/firestore";

let firestore: Firestore | undefined;

export function initializeFirebase(): void {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      // `demo-` prefix keeps the Firestore emulator strictly offline (never touches real GCP).
      initializeApp({ projectId: "demo-xrpl-stablecoin" });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  firestore = getAdminFirestore();
}

export function getFirestore(): Firestore {
  if (!firestore) {
    throw new Error("Firestore not initialized");
  }
  return firestore;
}
