import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
@Entity('class_session_students')
@Index(['sessionId', 'studentId'], { unique: true })
export class ClassSessionStudentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'session_id', type: 'char', length: 36 }) sessionId: string;
  @Column({ name: 'student_id', type: 'char', length: 36 }) studentId: string;
  @Column({ length: 150 }) name: string;
  @Column({ length: 150 }) school: string;
  @Column({ name: 'education_level', length: 50 }) educationLevel: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) status:
    'present' | 'excused' | 'sick' | 'absent' | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
}
