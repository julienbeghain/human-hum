DROP INDEX "listen"."albums_name_artist_id_mbid_idx";--> statement-breakpoint
DROP INDEX "listen"."artists_name_mbid_idx";--> statement-breakpoint
DROP INDEX "listen"."tracks_name_artist_id_mbid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "albums_name_artist_id_idx" ON "listen"."albums" USING btree ("name","artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artists_name_idx" ON "listen"."artists" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_name_artist_id_idx" ON "listen"."tracks" USING btree ("name","artist_id");