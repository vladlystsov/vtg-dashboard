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
  currentUid?: string
): { value: UserRole; label: string }[] {
  const isSelf = currentUid != null && target.uid === currentUid;

  // Никто не может менять роль другого владельца
  if (target.role === 'owner' && !isSelf) {
    return [];
  }

  // Свой профиль (в т.ч. владелец может понизить себя на любую роль)
  if (isSelf) {
    return ROLE_OPTIONS;
  }

  // Админ может назначить участника/админа, но не владельца
  if (currentRole === 'admin') {
    return ROLE_OPTIONS.filter((o) => o.value !== 'owner');
  }

  // Владелец может назначить любую роль другому (не владельцу)
  if (currentRole === 'owner') {
    return ROLE_OPTIONS;
  }

  return [];
}

export function canChangeRole(
  currentRole: UserRole | undefined,
  target: RoleTargetUser,
  currentUid?: string
): boolean {
  return getRoleOptionsFor(currentRole, target, currentUid).length > 0;
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
