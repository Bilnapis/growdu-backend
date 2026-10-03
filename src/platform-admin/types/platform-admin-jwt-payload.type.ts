export interface PlatformAdminJwtPayload {
  sub: string;
  sid: string;
  kind: 'platform-admin';
}
