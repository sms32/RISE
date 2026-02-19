'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';

type Role = 'admin' | 'student' | null;

interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
}

export function useAuth(requiredRole?: 'admin' | 'student'): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, loading: false });
        router.replace('/login');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
          await auth.signOut();
          router.replace('/login');
          return;
        }

        const role = userDoc.data().role as Role;
        console.log('useAuth — user role:', role, '| required:', requiredRole);

        // ── Wrong role → redirect to correct page ──────────────────────
        if (requiredRole && role !== requiredRole) {
          if (role === 'admin') {
            router.replace('/admin');
          } else if (role === 'student') {
            router.replace('/student');
          } else {
            router.replace('/login');
          }
          return; // Don't set state — let redirect happen
        }

        // ── Correct role → grant access ────────────────────────────────
        setState({ user, role, loading: false });

      } catch (err) {
        console.error('useAuth error:', err);
        setState({ user: null, role: null, loading: false });
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router, requiredRole]);

  return state;
}
