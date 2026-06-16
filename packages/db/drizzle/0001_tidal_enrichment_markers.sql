ALTER TABLE "listen"."albums" RENAME COLUMN "enriched_at" TO "lastfm_enriched_at";--> statement-breakpoint
ALTER TABLE "listen"."albums" ADD COLUMN "tidal_enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listen"."album_tracks" ADD COLUMN "tidal_track_id" text;--> statement-breakpoint
ALTER TABLE "listen"."album_tracks" ADD COLUMN "isrc" varchar(12);--> statement-breakpoint
ALTER TABLE "listen"."album_tracks" ADD COLUMN "tidal_link" text;