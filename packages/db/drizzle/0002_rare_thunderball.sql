-- Step 1: Add album_id to scrobbles
ALTER TABLE "listen"."scrobbles" ADD COLUMN "album_id" integer;--> statement-breakpoint
ALTER TABLE "listen"."scrobbles" ADD CONSTRAINT "scrobbles_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "listen"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scrobbles_album_id_idx" ON "listen"."scrobbles" USING btree ("album_id");--> statement-breakpoint

-- Step 2: Copy album_id from tracks to scrobbles
UPDATE "listen"."scrobbles" s
  SET "album_id" = t."album_id"
  FROM "listen"."tracks" t
  WHERE s."track_id" = t."id"
    AND t."album_id" IS NOT NULL;--> statement-breakpoint

-- Step 3: Drop album_id from tracks
ALTER TABLE "listen"."tracks" DROP CONSTRAINT "tracks_album_id_albums_id_fk";--> statement-breakpoint
DROP INDEX "listen"."tracks_album_id_idx";--> statement-breakpoint
ALTER TABLE "listen"."tracks" DROP COLUMN "album_id";