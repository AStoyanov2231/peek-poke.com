import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(import.meta.dirname, "../..");
const migrationPath = resolve(root, "supabase/migrations/20260908150805_profile_photo_moderation_buckets.sql");
const migration = await readFile(migrationPath, "utf8");
const oldBucketDefinition = "CHECK (storage_bucket = ANY (ARRAY['profile-photos'::text, 'private-profile-photos'::text]))";

async function createLegacyFixture(bucketConstraint = oldBucketDefinition) {
  const db = await PGlite.create();
  await db.exec(`
    create table public.profile_photos (
      id integer primary key,
      storage_bucket text not null,
      is_featured boolean not null default false,
      is_private boolean not null default false,
      constraint profile_photos_storage_bucket_check ${bucketConstraint},
      constraint profile_photos_featured_private_check check (not (is_featured and is_private))
    );
  `);
  return db;
}

async function constraintDefinition(db, name) {
  const result = await db.query(`
    select pg_get_constraintdef(oid, true) definition
    from pg_constraint
    where conrelid = 'public.profile_photos'::regclass and conname = $1
  `, [name]);
  return result.rows[0]?.definition ?? null;
}

let rejectedRowId = 100;

async function expectBucketRejected(db, bucket) {
  await assert.rejects(
    db.query(
      "insert into public.profile_photos(id,storage_bucket,is_featured,is_private) values($1,$2,false,false)",
      [rejectedRowId++, bucket],
    ),
    (error) => error?.code === "23514",
    `${bucket} must be rejected by the legacy bucket constraint`,
  );
}

const db = await createLegacyFixture();
try {
  assert.equal(
    await constraintDefinition(db, "profile_photos_storage_bucket_check"),
    oldBucketDefinition,
    "fixture must start from the exact captured legacy bucket constraint",
  );
  const featuredPrivateDefinition = await constraintDefinition(db, "profile_photos_featured_private_check");
  assert.ok(featuredPrivateDefinition, "fixture must retain the separate featured/private constraint");

  await db.query("insert into public.profile_photos(id,storage_bucket,is_featured,is_private) values(1,'profile-photos',true,false),(2,'private-profile-photos',false,true)");
  const preservedBefore = await db.query("select id,storage_bucket,is_featured,is_private from public.profile_photos order by id");

  await expectBucketRejected(db, "approved-profile-photos");
  await expectBucketRejected(db, "profile-media-quarantine");

  await db.exec(migration);

  assert.equal(
    await constraintDefinition(db, "profile_photos_featured_private_check"),
    featuredPrivateDefinition,
    "bucket migration must preserve the independent featured/private constraint",
  );
  const preservedAfter = await db.query("select id,storage_bucket,is_featured,is_private from public.profile_photos where id in (1,2) order by id");
  assert.deepEqual(preservedAfter.rows, preservedBefore.rows, "bucket migration must preserve existing photo data");

  for (const [id, bucket] of [
    [3, "profile-photos"],
    [4, "private-profile-photos"],
    [5, "approved-profile-photos"],
    [6, "profile-media-quarantine"],
  ]) {
    await db.query(
      "insert into public.profile_photos(id,storage_bucket,is_featured,is_private) values($1,$2,false,false)",
      [id, bucket],
    );
  }
  await expectBucketRejected(db, "unrelated-profile-photo-bucket");
  await assert.rejects(
    db.query("insert into public.profile_photos(id,storage_bucket,is_featured,is_private) values(7,'profile-photos',true,true)"),
    (error) => error?.code === "23514",
    "the independent featured/private constraint must still reject invalid data",
  );

  process.stdout.write("profile photo bucket SQL validation passed: legacy rejection, exact guarded expansion, data preservation, and unrelated-bucket denial\n");
} finally {
  await db.close();
}

const unexpectedBaseline = await createLegacyFixture("check (storage_bucket = 'profile-photos')");
try {
  await assert.rejects(
    unexpectedBaseline.exec(migration),
    /Unexpected profile photo bucket constraint/,
    "migration must refuse an unexpected baseline constraint",
  );
  process.stdout.write("profile photo bucket SQL validation passed: unexpected baseline is refused\n");
} finally {
  await unexpectedBaseline.close();
}
