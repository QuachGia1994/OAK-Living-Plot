import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import migrationSql from '../migrations/0001_initial.sql?raw';
import type { AppEnv } from '../src/env';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;

beforeEach(async () => {
  await applySqlMigration(db, migrationSql);
  await resetStoryData(db);
});

describe('D1UserRepository', () => {
  it('maps one auth subject to one stable internal user', async () => {
    const repository = new D1UserRepository(db);

    const first = await repository.resolveOrCreate('clerk-user-1');
    const second = await repository.resolveOrCreate('clerk-user-1');

    expect(second).toEqual(first);
    const count = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('creates distinct internal users for distinct auth subjects', async () => {
    const repository = new D1UserRepository(db);

    const first = await repository.resolveOrCreate('clerk-user-1');
    const second = await repository.resolveOrCreate('clerk-user-2');

    expect(second.id).not.toBe(first.id);
    expect(second.authSubject).toBe('clerk-user-2');
  });

  it('rejects a blank authenticated subject', async () => {
    const repository = new D1UserRepository(db);
    await expect(repository.resolveOrCreate('   ')).rejects.toThrow();
  });
});
