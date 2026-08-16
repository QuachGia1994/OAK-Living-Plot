export interface InternalUser {
  id: string;
  authSubject: string;
}

interface UserRow {
  id: string;
  auth_subject: string;
}

export class D1UserRepository {
  constructor(private readonly db: D1Database) {}

  async resolveOrCreate(authSubject: string): Promise<InternalUser> {
    const subject = authSubject.trim();
    if (!subject) throw new Error('Authenticated subject cannot be blank.');

    const candidateId = crypto.randomUUID();
    await this.db
      .prepare('INSERT INTO users (id, auth_subject) VALUES (?, ?) ON CONFLICT(auth_subject) DO NOTHING')
      .bind(candidateId, subject)
      .run();

    const row = await this.db
      .prepare('SELECT id, auth_subject FROM users WHERE auth_subject = ?')
      .bind(subject)
      .first<UserRow>();
    if (!row) throw new Error('Failed to resolve authenticated user.');

    return { id: row.id, authSubject: row.auth_subject };
  }
}
