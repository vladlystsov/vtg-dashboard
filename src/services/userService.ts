import { collection, onSnapshot, doc, updateDoc, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile, UserRole, ArtistRole } from '../types/track';

const usersRef = collection(db, 'users');

export function subscribeToUsers(
  callback: (users: UserProfile[]) => void,
  onError?: (e: Error) => void
) {
  return onSnapshot(usersRef, (snapshot) => {
    const users = snapshot.docs.map((d) => ({ ...d.data() } as UserProfile));
    callback(users);
  }, onError);
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(usersRef);
  return snap.docs.map((d) => ({ ...d.data() } as UserProfile));
}

export async function countUsers(): Promise<number> {
  const snap = await getDocs(usersRef);
  return snap.size;
}

export async function setUserRole(uid: string, role: UserRole) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { role });
}

export async function updateMyProfile(
  uid: string,
  data: { artistName?: string; roles?: ArtistRole[]; artistVerified?: boolean; isArtist?: boolean }
) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, data);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function deleteUser(uid: string) {
  await deleteDoc(doc(db, 'users', uid));
}
