import { collection, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile, UserRole } from '../types/track';

const usersRef = collection(db, 'users');

export function subscribeToUsers(callback: (users: UserProfile[]) => void) {
  return onSnapshot(usersRef, (snapshot) => {
    const users = snapshot.docs.map((d) => ({ ...d.data() } as UserProfile));
    callback(users);
  });
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
