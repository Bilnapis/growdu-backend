import { UserRole } from '../users/entities/user.entity.js';

export enum AnnouncementTargetRole {
  All = 'all',
  Admin = 'admin',
  Tutor = 'tutor',
  Parent = 'parent',
}

export enum AnnouncementStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Active = 'active',
  Expired = 'expired',
}

export function announcementTargetForRole(
  role: UserRole,
): AnnouncementTargetRole {
  switch (role) {
    case UserRole.Owner:
    case UserRole.Operator:
      return AnnouncementTargetRole.Admin;
    case UserRole.Tutor:
      return AnnouncementTargetRole.Tutor;
    case UserRole.Parent:
      return AnnouncementTargetRole.Parent;
  }
}

export function announcementStatus(
  startsAt: Date | null,
  endsAt: Date | null,
  now = new Date(),
): AnnouncementStatus {
  if (!startsAt) return AnnouncementStatus.Draft;
  if (now < startsAt) return AnnouncementStatus.Scheduled;
  if (endsAt && now >= endsAt) return AnnouncementStatus.Expired;
  return AnnouncementStatus.Active;
}
