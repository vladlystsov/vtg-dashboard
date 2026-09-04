import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ArtistRequest, UserProfile, ArtistRole } from '../types/track';
import { createNotification } from './notificationService';

const requestsRef = collection(db, 'artistRequests');

export function subscribeToRequests(
  callback: (reqs: ArtistRequest[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(requestsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ArtistRequest)));
  }, onError);
}

export async function createArtistRequest(profile: UserProfile): Promise<string> {
  const data: Omit<ArtistRequest, 'id'> = {
    uid: profile.uid,
    displayName: profile.displayName,
    email: profile.email,
    artistName: profile.artistName || profile.displayName,
    roles: profile.roles || ['artist'],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(requestsRef, data);
  try {
    await createNotification({
      type: 'artist_request',
      text: `Новая заявка на подтверждение артиста: ${data.artistName}`,
      actorUid: profile.uid,
      actorName: profile.displayName,
      createdAt: data.createdAt,
    });
  } catch (e) {
    console.error('notification create failed', e);
  }
  return ref.id;
}

export async function approveArtistRequest(requestId: string, request: ArtistRequest) {
  await updateDoc(doc(db, 'artistRequests', requestId), {
    status: 'approved',
    reviewedBy: 'system',
  });
  // mark user as verified artist
  const userRef = doc(db, 'users', request.uid);
  await updateDoc(userRef, {
    isArtist: true,
    artistVerified: true,
    artistName: request.artistName,
    roles: request.roles,
  });
}

export async function rejectArtistRequest(requestId: string) {
  await updateDoc(doc(db, 'artistRequests', requestId), {
    status: 'rejected',
    reviewedBy: 'system',
  });
  const data = await getDoc(doc(db, 'artistRequests', requestId));
  const req = data.data() as ArtistRequest;
  if (req) {
    await updateDoc(doc(db, 'users', req.uid), { artistVerified: false });
  }
}

export async function denyArtistRole(uid: string) {
  await updateDoc(doc(db, 'users', uid), { isArtist: false, artistVerified: false });
}

export async function clearRequestHistory() {
  const snapshot = await getDocs(requestsRef);
  await Promise.allSettled(
    snapshot.docs.map((d) => deleteDoc(doc(db, 'artistRequests', d.id)))
  );
}

export type { ArtistRole };
