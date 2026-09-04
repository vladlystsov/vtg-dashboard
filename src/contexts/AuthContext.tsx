import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { UserProfile, UserRole } from '../types/track';
import { countUsers, getAllUsers } from '../services/userService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          let p = snap.data() as UserProfile;
          if (p.role !== 'owner' && p.role !== 'admin') {
            try {
              const all = await getAllUsers();
              const hasOwnerOrAdmin = all.some((u) => u.role === 'owner' || u.role === 'admin');
              if (!hasOwnerOrAdmin) {
                await updateDoc(ref, { role: 'owner', isArtist: true, artistVerified: true });
                p = { ...p, role: 'owner', isArtist: true, artistVerified: true };
              }
            } catch {
              // ignore
            }
          }
          setProfile(p);
        } else {
          let role: UserRole = 'member';
          try {
            const total = await countUsers();
            if (total === 0) role = 'owner';
          } catch {
            role = 'member';
          }
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Участник',
            role,
            ...(role === 'owner' ? { isArtist: true, artistVerified: true } : {}),
          };
          await setDoc(ref, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    let role: UserRole = 'member';
    try {
      const total = await countUsers();
      if (total === 0) role = 'owner';
    } catch {
      role = 'member';
    }
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email,
      displayName,
      role,
      ...(role === 'owner' ? { isArtist: true, artistVerified: true } : {}),
    };
    await setDoc(doc(db, 'users', cred.user.uid), newProfile);
    setProfile(newProfile);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
