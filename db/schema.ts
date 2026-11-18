import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{code:text('code').primaryKey(),hostId:text('host_id').notNull(),state:text('state').notNull(),version:integer('version').notNull().default(0),updatedAt:integer('updated_at').notNull()});
export const sessions=sqliteTable('sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),role:text('role').notNull(),expiresAt:integer('expires_at').notNull()
}, t=>[index('sessions_expiry').on(t.expiresAt)]);
export const rateLimits=sqliteTable('rate_limits',{
 key:text('key').primaryKey(),hits:integer('hits').notNull(),resetAt:integer('reset_at').notNull()
}, t=>[index('rate_limits_expiry').on(t.resetAt)]);
