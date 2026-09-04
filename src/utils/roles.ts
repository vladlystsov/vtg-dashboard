import type { UserRole } from '../types/track';

export interface RoleTargetUser {
  uid: string;
  role: UserRole;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Участник' },
  { value: 'admin', label: 'Админ' },
  { value: 'owner', label: 'Владелец' },
];

export function getRoleOptionsFor(
  currentRole: UserRole | undefined,
  target: RoleTargetUser,
  currentUid?: string,
  ownerCount = 1
): { value: UserRole; label: string }[] {
  const isSelf = currentUid != null && target.uid === currentUid;

  // Никто не может менять роль другого владельца
  if (target.role === 'owner' && !isSelf) {
    return [];
  }

  // Свой профиль
  if (isSelf) {
    // Админ не может повысить себя до Владельца
    if (currentRole === 'admin') {
      return ROLE_OPTIONS.filter((o) => o.value !== 'owner');
    }
    // Владелец может понизить себя, но только если он не единственный владелец
    if (currentRole === 'owner') {
      if (ownerCount <= 1) {
        return ROLE_OPTIONS.filter((o) => o.value === 'owner');
      }
      return ROLE_OPTIONS;
    }
    return ROLE_OPTIONS;
  }

  // Не свой профиль
  if (currentRole === 'admin') {
    return ROLE_OPTIONS.filter((o) => o.value !== 'owner');
  }

  // Владелец назначает любую роль другому (не владельцу)
  if (currentRole === 'owner') {
    return ROLE_OPTIONS;
  }

  return [];
}

export function canChangeRole(
  currentRole: UserRole | undefined,
  target: RoleTargetUser,
  currentUid?: string,
  ownerCount = 1
): boolean {
  return getRoleOptionsFor(currentRole, target, currentUid, ownerCount).length > 0;
}

export function isSoleOwnerDemoting(
  currentRole: UserRole | undefined,
  target: RoleTargetUser,
  currentUid?: string,
  ownerCount = 1
): boolean {
  const isSelf = currentUid != null && target.uid === currentUid;
  return !!(isSelf && currentRole === 'owner' && ownerCount <= 1);
}

export function canDenyArtist(
  currentRole: UserRole | undefined,
  target: RoleTargetUser,
  currentUid?: string
): boolean {
  const isSelf = currentUid != null && target.uid === currentUid;

  // Свой профиль — можно
  if (isSelf) return true;

  // Владелец и админ не могут снять подтверждённого артиста с другого владельца
  if (target.role === 'owner') return false;

  // Админ не может снять подтверждённого артиста с другого админа
  if (currentRole === 'admin' && target.role === 'admin') return false;

  // Владелец может снять с админа и участника; админ — с участника
  return currentRole === 'owner' || currentRole === 'admin';
}
