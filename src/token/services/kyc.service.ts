import { getFirestore } from "@common/config/firebase.js";
import { ConflictError, NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { getProjectAuth } from "@token/middleware/auth.js";
import type { KycInfo } from "@token/types/user.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

export interface SubmitKycInput {
  fullName: string;
  phoneNumber: string;
  postalCode: string;
  prefecture: string;
  city: string;
  town: string;
  address: string;
}

function validateKycInput(input: SubmitKycInput): void {
  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new ValidationError("fullName is required");
  }

  if (!input.phoneNumber || !/^0\d{9,10}$/.test(input.phoneNumber)) {
    throw new ValidationError("phoneNumber must be a valid Japanese phone number (e.g. 09012345678)");
  }

  if (!input.postalCode || !/^\d{7}$/.test(input.postalCode)) {
    throw new ValidationError("postalCode must be 7 digits (e.g. 1000001)");
  }

  if (!input.prefecture || input.prefecture.trim().length === 0) {
    throw new ValidationError("prefecture is required");
  }

  if (!input.city || input.city.trim().length === 0) {
    throw new ValidationError("city is required");
  }

  if (input.town == null) {
    throw new ValidationError("town is required");
  }

  if (!input.address || input.address.trim().length === 0) {
    throw new ValidationError("address is required");
  }
}

export async function submitKyc(uid: string, input: SubmitKycInput): Promise<KycInfo> {
  validateKycInput(input);

  const db = getFirestore();
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new NotFoundError("User not found");
  }

  const user = userDoc.data()!;
  if (user.kycStatus === "approved") {
    throw new ConflictError("KYC already approved");
  }

  const kycData = {
    fullName: input.fullName.trim(),
    phoneNumber: input.phoneNumber,
    postalCode: input.postalCode,
    prefecture: input.prefecture,
    city: input.city.trim(),
    town: input.town.trim(),
    address: input.address.trim(),
    status: "approved" as const,
    submittedAt: FieldValue.serverTimestamp(),
  };

  const kycRef = userRef.collection("kyc").doc("info");
  await kycRef.set(kycData);
  await userRef.update({ kycStatus: "approved" });
  await getProjectAuth().setCustomUserClaims(uid, { kycStatus: "approved" });

  const created = await kycRef.get();
  return created.data() as KycInfo;
}

export async function getKyc(uid: string): Promise<KycInfo | null> {
  const db = getFirestore();
  const kycDoc = await db.collection(USERS_COLLECTION).doc(uid).collection("kyc").doc("info").get();

  if (!kycDoc.exists) {
    return null;
  }

  return kycDoc.data() as KycInfo;
}
