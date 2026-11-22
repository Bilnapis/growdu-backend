export type ReportStatus =
  'unfilled' | 'draft' | 'partially_published' | 'published';
export interface ReportContent {
  material: string;
  progress: string;
  followUp: string;
  parentNote: string;
}
export interface ReportStudent {
  id: string;
  name: string;
  school: string;
  educationLevel: string;
  status: 'present' | 'excused' | 'sick' | 'absent' | null;
}
export interface ReportSession {
  id: string;
  version: number;
  date: string;
  status: 'scheduled' | 'completed';
  students: ReportStudent[];
}
export interface ReportSnapshot {
  tenantName: string;
  groupName: string;
  tutorName: string;
  subject: string;
  sessions: ReportSession[];
}
export interface ReportNote {
  studentId: string;
  note: string;
}
export const emptyContent = (): ReportContent => ({
  material: '',
  progress: '',
  followUp: '',
  parentNote: '',
});
